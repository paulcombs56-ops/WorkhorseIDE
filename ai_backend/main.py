"""Workhorse IDE - Local AI Backend
GPU-accelerated code intelligence using Ollama/vLLM
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import httpx
import logging
from typing import Optional
import os
import json
import ast
import re
import asyncio
import difflib
import subprocess
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI(title="Workhorse AI Backend", version="0.1.0")

# Configure CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration - use environment variables or defaults
OLLAMA_BASE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
VLLM_BASE_URL = os.getenv("VLLM_URL", "http://localhost:8000")
AI_PROVIDER = os.getenv("AI_PROVIDER", "ollama")  # "ollama" or "vllm"
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "codellama:7b")  # or "mistral", "neural-chat", etc.
CHAT_MODEL = os.getenv("CHAT_MODEL", DEFAULT_MODEL)
ADAPTIVE_MODEL_ROUTING = os.getenv("ADAPTIVE_MODEL_ROUTING", "true").strip().lower() in {"1", "true", "yes", "on"}
GPU_VRAM_GB_OVERRIDE = os.getenv("GPU_VRAM_GB_OVERRIDE", "").strip()
MODEL_VRAM_HEADROOM_GB = float(os.getenv("MODEL_VRAM_HEADROOM_GB", "1.0"))
MODEL_NEAR_FIT_TOLERANCE_GB = float(os.getenv("MODEL_NEAR_FIT_TOLERANCE_GB", "0.5"))
WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", str(Path(__file__).resolve().parents[1]))).resolve()
ACTION_HISTORY: list[dict] = []
_MODEL_LIST_CACHE: dict = {"expires": 0.0, "models": []}


def _parse_billion_count(value: str) -> Optional[float]:
    if not value:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*b", str(value).lower())
    if not match:
        return None
    return float(match.group(1))


def _detect_gpu_vram_gb() -> Optional[float]:
    if GPU_VRAM_GB_OVERRIDE:
        try:
            return float(GPU_VRAM_GB_OVERRIDE)
        except ValueError:
            logger.warning("Invalid GPU_VRAM_GB_OVERRIDE value: %s", GPU_VRAM_GB_OVERRIDE)

    try:
        cmd = ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"]
        output = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL, timeout=2)
        values = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                values.append(float(line))
            except ValueError:
                continue
        if not values:
            return None
        return max(values) / 1024.0
    except Exception:
        return None


def _estimate_model_vram_requirement_gb(model_name: str, details: Optional[dict] = None) -> float:
    details = details or {}
    parameter_size = str(details.get("parameter_size", ""))
    billions = _parse_billion_count(parameter_size) or _parse_billion_count(model_name) or 7.0

    quant = str(details.get("quantization_level", "")).lower()
    lower_name = model_name.lower()

    if "q4" in quant or "q4" in lower_name:
        return billions * 0.60 + 1.0
    if "q5" in quant or "q5" in lower_name:
        return billions * 0.75 + 1.2
    if "q8" in quant or "q8" in lower_name:
        return billions * 1.10 + 1.5
    return billions * 1.30 + 1.8


def _model_quality_score(model_name: str, details: Optional[dict], language: str) -> float:
    details = details or {}
    lower_name = model_name.lower()
    parameter_size = str(details.get("parameter_size", ""))
    billions = _parse_billion_count(parameter_size) or _parse_billion_count(lower_name) or 7.0

    score = billions

    if any(token in lower_name for token in ["coder", "code", "deepseek-coder", "codellama"]):
        score += 4.0
    if any(token in lower_name for token in ["qwen2.5", "qwen3", "deepseek"]):
        score += 1.5
    if language.lower() in {"python", "javascript", "typescript"}:
        score += 0.5

    return score


async def _get_ollama_models_cached() -> list[dict]:
    now = time.time()
    if _MODEL_LIST_CACHE["expires"] > now and _MODEL_LIST_CACHE["models"]:
        return _MODEL_LIST_CACHE["models"]

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        response.raise_for_status()
        data = response.json()

    models = data.get("models", []) if isinstance(data, dict) else []
    if not isinstance(models, list):
        models = []

    _MODEL_LIST_CACHE["models"] = models
    _MODEL_LIST_CACHE["expires"] = now + 30
    return models


async def _select_runtime_model(
    requested_model: str,
    purpose: str,
    language: str,
) -> tuple[str, str]:
    requested_model = str(requested_model or "").strip()
    if requested_model:
        return requested_model, "requested by client"

    baseline = CHAT_MODEL if purpose == "chat" else DEFAULT_MODEL

    if AI_PROVIDER != "ollama":
        return baseline, "non-ollama provider"

    if not ADAPTIVE_MODEL_ROUTING:
        return baseline, "adaptive routing disabled"

    try:
        models = await _get_ollama_models_cached()
    except Exception as exc:
        logger.warning("Model discovery failed, using baseline %s: %s", baseline, exc)
        return baseline, "model discovery failed"

    if not models:
        return baseline, "no installed models found"

    vram_gb = _detect_gpu_vram_gb()
    budget_gb = None if vram_gb is None else max(2.0, vram_gb - MODEL_VRAM_HEADROOM_GB)

    candidates = []
    for item in models:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        details = item.get("details", {}) if isinstance(item.get("details", {}), dict) else {}
        required = _estimate_model_vram_requirement_gb(name, details)
        quality = _model_quality_score(name, details, language)
        fits = budget_gb is None or required <= budget_gb
        candidates.append(
            {
                "name": name,
                "required": required,
                "quality": quality,
                "fits": fits,
            }
        )

    if not candidates:
        return baseline, "no valid candidates"

    fitting = [item for item in candidates if item["fits"]]

    near_fit = []
    if budget_gb is not None:
        max_required = budget_gb + max(0.0, MODEL_NEAR_FIT_TOLERANCE_GB)
        near_fit = [item for item in candidates if item["required"] <= max_required]

    pool = fitting or near_fit or candidates

    pool.sort(key=lambda item: (item["quality"], -item["required"]), reverse=True)
    selected = pool[0]

    if budget_gb is None:
        reason = "adaptive routing without VRAM telemetry"
    elif fitting:
        reason = f"best-fit for ~{vram_gb:.1f} GB VRAM"
    elif near_fit:
        reason = f"near-fit for ~{vram_gb:.1f} GB VRAM"
    else:
        reason = f"fallback (no model fit ~{vram_gb:.1f} GB budget)"

    return selected["name"], reason


def _extract_first_json_object(text: str) -> Optional[dict]:
    """Extract and parse the first JSON object found in model output."""
    if not text:
        return None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for index in range(start, len(text)):
        char = text[index]

        if escape:
            escape = False
            continue

        if char == "\\":
            escape = True
            continue

        if char == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : index + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    return None

    return None


def _normalize_documentation_output(value) -> str:
    """Normalize documentation output into a clean string."""
    if isinstance(value, dict):
        lines = []

        description = value.get("description")
        if description:
            lines.append(str(description).strip())

        input_args = value.get("input_args") or value.get("args")
        if isinstance(input_args, dict) and input_args:
            lines.append("\nArgs:")
            for arg_name, arg_meta in input_args.items():
                if isinstance(arg_meta, dict):
                    arg_type = arg_meta.get("type", "any")
                    arg_desc = arg_meta.get("description", "")
                    lines.append(f"- {arg_name} ({arg_type}): {arg_desc}".strip())
                else:
                    lines.append(f"- {arg_name}: {arg_meta}")

        outputs = value.get("outputs") or value.get("returns")
        if isinstance(outputs, dict) and outputs:
            lines.append("\nReturns:")
            for out_name, out_meta in outputs.items():
                if isinstance(out_meta, dict):
                    out_type = out_meta.get("type", "any")
                    out_desc = out_meta.get("description", "")
                    lines.append(f"- {out_name} ({out_type}): {out_desc}".strip())
                else:
                    lines.append(f"- {out_name}: {out_meta}")

        if lines:
            return "\n".join(lines).strip()

        return json.dumps(value, indent=2)

    if isinstance(value, list):
        return "\n".join(str(item) for item in value).strip()

    text = str(value).strip()
    if not text:
        return text

    # Handle Python-dict-like strings returned by some model responses
    if text.startswith("{") and text.endswith("}") and "'" in text:
        try:
            parsed = ast.literal_eval(text)
            return _normalize_documentation_output(parsed)
        except (ValueError, SyntaxError):
            return text

    return text


def _extract_code_block(text: str) -> str:
    """Extract first fenced code block from text, if present."""
    if not text:
        return ""

    fence = "```"
    start = text.find(fence)
    if start == -1:
        return ""

    start = text.find("\n", start)
    if start == -1:
        return ""
    start += 1

    end = text.find(fence, start)
    if end == -1:
        return ""

    return text[start:end].strip()


def _looks_like_code_request(text: str) -> bool:
    if not text:
        return False
    return bool(
        re.search(
            r"\b(write|create|generate|implement|function|class|script|example|snippet|refactor|fix)\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _normalize_runtime_identity_message(message: str) -> str:
    """Prevent misleading cloud-LLM identity responses in Workhorse chat."""
    text = str(message or "").strip()
    if not text:
        return text

    lower = text.lower()
    gpu_denial_markers = [
        "don't have access to your gpu",
        "do not have access to your gpu",
        "can't access your gpu",
        "cannot access your gpu",
        "no access to your gpu",
        "not capable of running ai functions on your gpu",
        "not capable of using your gpu",
        "cannot run on your gpu",
        "can't run on your gpu",
        "does not use your gpu",
        "doesn't use your gpu",
    ]

    generic_identity_markers = [
        "i'm a large language model",
        "i am a large language model",
        "as an ai language model",
    ]

    if any(marker in lower for marker in gpu_denial_markers) or any(
        marker in lower for marker in generic_identity_markers
    ):
        return (
            "In Workhorse, I run through your local Ollama service on this machine. "
            "This setup can use your GPU when Ollama/model support is available; "
            "actual GPU utilization depends on your local runtime configuration."
        )

    gpu_negative_pattern = re.search(
        r"\bgpu\b.*\b(does\s+not|doesn't|cannot|can't|not\s+capable|no)\b.*\b(use|access|run|utilize)\b|"
        r"\b(does\s+not|doesn't|cannot|can't|not\s+capable|no)\b.*\bgpu\b",
        lower,
    )
    if gpu_negative_pattern:
        return (
            "In Workhorse, I run through your local Ollama service on this machine. "
            "This setup can use your GPU when Ollama/model support is available; "
            "actual GPU utilization depends on your local runtime configuration."
        )

    return text


def _prepare_chat_messages(request: ChatAssistRequest) -> tuple[str, str, list[dict]]:
    requested_model = request.model or ""
    code_context = request.code_context.strip()
    code_context = code_context[-12000:] if code_context else ""

    system_prompt = f"""You are Workhorse, a high-quality local coding assistant.
Primary language: {request.language}
Workspace root: {WORKSPACE_ROOT}

Always return ONLY valid JSON with this schema:
{{
  "message": "brief, practical response",
  "code": "code snippet only when useful, else empty string",
  "actions": [
    {{"type": "mkdir", "path": "relative/path"}},
    {{"type": "write_file", "path": "relative/path.ext", "content": "full file content"}},
    {{"type": "append_file", "path": "relative/path.ext", "content": "text"}}
    ],
    "plan": ["step 1", "step 2"],
    "verification_commands": ["command 1", "command 2"]
}}

Rules:
- Keep explanations concise and implementation-focused.
- Generate correct, runnable code with proper indentation.
- Use only relative paths for actions and keep actions minimal.
- If unsure, return actions as [] and provide code in "code".
- Identity and runtime truthfulness:
    - You are the local Workhorse assistant, not a cloud-hosted generic AI persona.
    - Do not say you "don't have access" to the user's GPU in this environment.
    - If asked about GPU/hardware, state that Workhorse routes requests to local Ollama,
        which can use GPU when supported/configured, and actual utilization depends on runtime/model.
"""

    if request.complex_mode:
        system_prompt += """

Complex task mode is ON.
Additional rules:
- Always provide a concrete multi-step implementation plan in "plan" (minimum 3 steps) before proposing actions.
- For multi-file or architectural work, propose all required file actions together.
- Always include verification_commands that the user can run locally to validate changes.
- Keep "actions" as a reviewable proposal only; do not assume auto-apply.
"""

    messages = [{"role": "system", "content": system_prompt}]

    if code_context:
        messages.append(
            {
                "role": "system",
                "content": f"Current editor context (truncated):\n{code_context}",
            }
        )

    for item in request.history[-10:]:
        role = str(item.get("role", "user")).strip().lower()
        if role not in {"user", "assistant", "system"}:
            role = "user"
        content = str(item.get("content", "")).strip()
        if content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": request.message})
    return requested_model, code_context, messages


async def _finalize_chat_result(
    request: ChatAssistRequest,
    selected_model: str,
    model_selection_reason: str,
    code_context: str,
    raw_output: str,
) -> ChatAssistResponse:
    parsed = _extract_first_json_object(raw_output)
    actions_proposed = []
    actions_executed = []
    action_errors = []
    history_id = None
    plan: list[str] = []
    verification_commands: list[str] = []

    if parsed is None:
        message = raw_output or "I could not generate a response."
        code = _extract_code_block(raw_output)
    else:
        message = str(parsed.get("message", "")).strip() or "I could not generate a response."
        code = str(parsed.get("code", "")).strip()

        parsed_plan = parsed.get("plan", [])
        if isinstance(parsed_plan, list):
            plan = [str(item).strip() for item in parsed_plan if str(item).strip()]

        parsed_verify = parsed.get("verification_commands", [])
        if isinstance(parsed_verify, list):
            verification_commands = [str(item).strip() for item in parsed_verify if str(item).strip()]

    message = _normalize_runtime_identity_message(message)

    if parsed is not None and request.enable_file_actions:
        actions = parsed.get("actions", [])
        if not isinstance(actions, list):
            actions = []
        actions_proposed = actions

        if request.auto_apply_actions and actions:
            actions_executed, action_errors, undo_ops = _apply_file_actions(actions, capture_undo=True)
            if undo_ops and not action_errors:
                ACTION_HISTORY.append({"undo_ops": undo_ops})
                history_id = len(ACTION_HISTORY)

    if not code and _looks_like_code_request(request.message) and AI_PROVIDER == "ollama":
        fallback_prompt = f"""Return only {request.language} code for this request. No markdown fences, no prose.

Request:
{request.message}

Context (optional):
{code_context or '(none)'}
"""
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                fallback_response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": selected_model,
                        "prompt": fallback_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.2,
                            "top_p": 0.9,
                        },
                    },
                )
                fallback_response.raise_for_status()
                fallback_data = fallback_response.json()
                fallback_code = str(fallback_data.get("response", "")).strip()
                if fallback_code:
                    code = fallback_code
        except Exception as fallback_error:
            logger.warning(f"Chat code fallback failed: {fallback_error}")

    if request.complex_mode and not plan:
        plan = [
            "Inspect relevant files and confirm constraints",
            "Implement targeted code changes file by file",
            "Run verification commands and summarize outcomes",
        ]

    if request.complex_mode and not verification_commands:
        if request.language.lower() == "python":
            verification_commands = [
                "python -m pytest",
                "python -m py_compile <changed_file.py>",
            ]
        else:
            verification_commands = [
                "npm run lint",
                "npm test",
            ]

    return ChatAssistResponse(
        message=message,
        code=code,
        actions_proposed=actions_proposed,
        actions_executed=actions_executed,
        action_errors=action_errors,
        history_id=history_id,
        plan=plan,
        verification_commands=verification_commands,
        selected_model=selected_model,
        model_selection_reason=model_selection_reason,
    )

# ===========================
# Request/Response Models
# ===========================

class CodeCompletionRequest(BaseModel):
    code: str
    language: str
    cursor_position: int
    context_lines: int = 10


class CodeCompletionResponse(BaseModel):
    completion: str
    confidence: float


class CodeAnalysisRequest(BaseModel):
    code: str
    language: str


class CodeAnalysisResponse(BaseModel):
    issues: list[dict]
    suggestions: list[str]


class CodeRefactorRequest(BaseModel):
    code: str
    language: str
    refactor_type: str  # "extract-function", "rename-variable", "simplify", etc.


class CodeRefactorResponse(BaseModel):
    refactored_code: str
    explanation: str


class DocGenerationRequest(BaseModel):
    code: str
    language: str
    style: str = "google"  # "google", "numpy", "sphinx"


class DocGenerationResponse(BaseModel):
    documentation: str


class ChatAssistRequest(BaseModel):
    message: str
    language: str = "javascript"
    code_context: str = ""
    history: list[dict] = Field(default_factory=list)
    enable_file_actions: bool = True
    auto_apply_actions: bool = False
    complex_mode: bool = False
    model: Optional[str] = None


class ChatAssistResponse(BaseModel):
    message: str
    code: str = ""
    actions_proposed: list[dict] = Field(default_factory=list)
    actions_executed: list[str] = Field(default_factory=list)
    action_errors: list[str] = Field(default_factory=list)
    history_id: Optional[int] = None
    plan: list[str] = Field(default_factory=list)
    verification_commands: list[str] = Field(default_factory=list)
    selected_model: str = ""
    model_selection_reason: str = ""


class ChatApplyActionsRequest(BaseModel):
    actions: list[dict] = Field(default_factory=list)


class ChatApplyActionsResponse(BaseModel):
    actions_executed: list[str] = Field(default_factory=list)
    action_errors: list[str] = Field(default_factory=list)
    history_id: Optional[int] = None


class ChatUndoResponse(BaseModel):
    undone: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    history_id: Optional[int] = None


class ChatPreviewActionsRequest(BaseModel):
    actions: list[dict] = Field(default_factory=list)


class ChatPreviewActionsResponse(BaseModel):
    previews: list[dict] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


def _resolve_workspace_path(relative_path: str) -> Path:
    """Resolve path safely inside workspace root."""
    candidate = (WORKSPACE_ROOT / relative_path).resolve()
    candidate_str = str(candidate)
    root_str = str(WORKSPACE_ROOT)
    if not (candidate_str == root_str or candidate_str.startswith(root_str + os.sep)):
        raise ValueError(f"Path escapes workspace root: {relative_path}")
    return candidate


def _apply_file_actions(actions: list[dict], capture_undo: bool = False) -> tuple[list[str], list[str], list[dict]]:
    """Apply model-suggested file actions with workspace safety checks."""
    executed = []
    errors = []
    undo_ops = []

    for action in actions:
        action_type = str(action.get("type", "")).strip().lower()
        path_value = str(action.get("path", "")).strip()
        content = action.get("content", "")

        if not action_type:
            errors.append("Missing action type")
            continue

        if action_type == "list_tree":
            executed.append("Listed workspace tree (handled in chat response)")
            continue

        if not path_value:
            errors.append(f"{action_type}: missing path")
            continue

        try:
            target = _resolve_workspace_path(path_value)

            if action_type == "mkdir":
                existed_before = target.exists()
                target.mkdir(parents=True, exist_ok=True)
                executed.append(f"Created directory: {path_value}")
                if capture_undo and not existed_before:
                    undo_ops.append({"type": "rmdir_if_empty", "path": path_value})

            elif action_type == "write_file":
                existed_before = target.exists()
                previous_content = target.read_text(encoding="utf-8") if existed_before else ""
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(str(content), encoding="utf-8")
                executed.append(f"Wrote file: {path_value}")
                if capture_undo:
                    undo_ops.append(
                        {
                            "type": "restore_file",
                            "path": path_value,
                            "existed": existed_before,
                            "content": previous_content,
                        }
                    )

            elif action_type == "append_file":
                existed_before = target.exists()
                previous_content = target.read_text(encoding="utf-8") if existed_before else ""
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("a", encoding="utf-8") as fp:
                    fp.write(str(content))
                executed.append(f"Appended file: {path_value}")
                if capture_undo:
                    undo_ops.append(
                        {
                            "type": "restore_file",
                            "path": path_value,
                            "existed": existed_before,
                            "content": previous_content,
                        }
                    )

            else:
                errors.append(f"Unsupported action type: {action_type}")

        except Exception as exc:
            errors.append(f"{action_type} {path_value}: {exc}")

    return executed, errors, undo_ops


def _undo_action_transaction(undo_ops: list[dict]) -> tuple[list[str], list[str]]:
    undone = []
    errors = []

    for undo in reversed(undo_ops):
        undo_type = str(undo.get("type", "")).strip().lower()
        path_value = str(undo.get("path", "")).strip()

        try:
            target = _resolve_workspace_path(path_value)

            if undo_type == "restore_file":
                existed = bool(undo.get("existed", False))
                content = str(undo.get("content", ""))

                if existed:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content, encoding="utf-8")
                    undone.append(f"Restored file: {path_value}")
                else:
                    if target.exists():
                        target.unlink()
                    undone.append(f"Removed file: {path_value}")

            elif undo_type == "rmdir_if_empty":
                if target.exists() and target.is_dir() and not any(target.iterdir()):
                    target.rmdir()
                    undone.append(f"Removed directory: {path_value}")
                else:
                    errors.append(f"Could not remove non-empty directory: {path_value}")

            else:
                errors.append(f"Unsupported undo type: {undo_type}")

        except Exception as exc:
            errors.append(f"undo {undo_type} {path_value}: {exc}")

    return undone, errors


def _build_action_previews(actions: list[dict]) -> tuple[list[dict], list[str]]:
    previews = []
    errors = []

    for action in actions:
        action_type = str(action.get("type", "")).strip().lower()
        path_value = str(action.get("path", "")).strip()
        content = str(action.get("content", ""))

        if action_type == "list_tree":
            previews.append({
                "type": action_type,
                "path": "",
                "summary": "List workspace tree",
                "diff": "",
            })
            continue

        if not action_type or not path_value:
            errors.append("Invalid action: missing type or path")
            continue

        try:
            target = _resolve_workspace_path(path_value)

            if action_type == "mkdir":
                previews.append({
                    "type": action_type,
                    "path": path_value,
                    "summary": "Create directory",
                    "diff": "(directory will be created if missing)",
                })
                continue

            if action_type not in {"write_file", "append_file"}:
                errors.append(f"Unsupported action type: {action_type}")
                continue

            old_content = ""
            if target.exists() and target.is_file():
                old_content = target.read_text(encoding="utf-8")

            if action_type == "write_file":
                new_content = content
                summary = "Overwrite file content"
            else:
                new_content = old_content + content
                summary = "Append content to file"

            diff_lines = list(
                difflib.unified_diff(
                    old_content.splitlines(),
                    new_content.splitlines(),
                    fromfile=f"a/{path_value}",
                    tofile=f"b/{path_value}",
                    lineterm="",
                )
            )
            diff_text = "\n".join(diff_lines) if diff_lines else "(no content changes)"

            previews.append(
                {
                    "type": action_type,
                    "path": path_value,
                    "summary": summary,
                    "diff": diff_text,
                }
            )

        except Exception as exc:
            errors.append(f"preview {action_type} {path_value}: {exc}")

    return previews, errors


# ===========================
# Health Check
# ===========================

@app.get("/health")
async def health():
    """Check if AI backend is running and model is available"""
    detected_vram = _detect_gpu_vram_gb()
    selected_chat_model, reason = await _select_runtime_model("", "chat", "python")
    return {
        "status": "ok",
        "provider": AI_PROVIDER,
        "model": DEFAULT_MODEL,
        "chat_model": selected_chat_model,
        "chat_model_reason": reason,
        "adaptive_model_routing": ADAPTIVE_MODEL_ROUTING,
        "detected_gpu_vram_gb": round(detected_vram, 2) if detected_vram is not None else None,
        "ollama_url": OLLAMA_BASE_URL,
        "vllm_url": VLLM_BASE_URL,
    }


# ===========================
# AI Code Completion
# ===========================

@app.post("/complete", response_model=CodeCompletionResponse)
async def code_complete(request: CodeCompletionRequest):
    """
    Generate code completions using local LLM.
    Uses GPU acceleration via Ollama/vLLM.
    """
    try:
        selected_model, _ = await _select_runtime_model("", "general", request.language)

        # Extract context around cursor
        lines = request.code.split("\n")
        cursor_line = request.code[:request.cursor_position].count("\n")
        start_line = max(0, cursor_line - request.context_lines)
        end_line = min(len(lines), cursor_line + request.context_lines)
        context = "\n".join(lines[start_line:end_line])

        # Build prompt for code completion
        prompt = f"""You are a helpful code assistant. Complete the following {request.language} code snippet. 
Only return the completion, not the full code.

Code:
{context}

Completion:"""

        # Call local LLM via Ollama
        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": selected_model,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                completion = data.get("response", "").strip()

        # Call vLLM if using that instead
        elif AI_PROVIDER == "vllm":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{VLLM_BASE_URL}/v1/completions",
                    json={
                        "model": selected_model,
                        "prompt": prompt,
                        "max_tokens": 100,
                        "temperature": 0.7,
                    },
                )
                response.raise_for_status()
                data = response.json()
                completion = data["choices"][0]["text"].strip()
        else:
            raise ValueError(f"Unknown AI provider: {AI_PROVIDER}")

        return CodeCompletionResponse(
            completion=completion,
            confidence=0.85,  # Placeholder; can be enhanced
        )

    except Exception as e:
        logger.error(f"Completion error: {e}")
        raise HTTPException(status_code=500, detail=f"Completion failed: {str(e)}")


# ===========================
# AI Code Analysis
# ===========================

@app.post("/analyze", response_model=CodeAnalysisResponse)
async def analyze_code(request: CodeAnalysisRequest):
    """
    Analyze code for issues, bugs, and improvement suggestions.
    Runs locally on GPU.
    """
    try:
        selected_model, _ = await _select_runtime_model("", "general", request.language)

        prompt = f"""Analyze the following {request.language} code for bugs, issues, and improvement opportunities.
Return ONLY valid JSON. Do not include markdown, prose, or explanations outside JSON.

Required JSON schema:
{{
    "issues": [
        {{"line": "<line number or unknown>", "message": "<issue description>", "severity": "low|medium|high"}}
    ],
    "suggestions": ["<actionable suggestion>"]
}}

If there are no issues, return:
{{"issues": [], "suggestions": []}}

Code:
{request.code}

Analysis (JSON):"""

        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": selected_model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                analysis_text = data.get("response", "").strip()
        else:
            raise ValueError("Unsupported provider for analysis")

        analysis = _extract_first_json_object(analysis_text)
        if analysis is None:
            issues = [{"line": "unknown", "message": analysis_text}]
            suggestions = []
        else:
            issues = analysis.get("issues", [])
            suggestions = analysis.get("suggestions", [])

            if not isinstance(issues, list):
                issues = []
            if not isinstance(suggestions, list):
                suggestions = []

            normalized_issues = []
            for item in issues:
                if isinstance(item, dict):
                    normalized_issues.append(item)
                else:
                    normalized_issues.append({"line": "unknown", "message": str(item)})
            issues = normalized_issues

            suggestions = [str(item) for item in suggestions]

        return CodeAnalysisResponse(issues=issues, suggestions=suggestions)

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ===========================
# AI Code Refactoring
# ===========================

@app.post("/refactor", response_model=CodeRefactorResponse)
async def refactor_code(request: CodeRefactorRequest):
    """
    Refactor code using local LLM.
    Supports multiple refactoring patterns (extract, simplify, rename, etc.)
    """
    try:
        selected_model, _ = await _select_runtime_model("", "general", request.language)

        refactor_instructions = {
            "extract-function": "Extract a cohesive function from the code.",
            "simplify": "Simplify the code while maintaining functionality.",
            "rename-variable": "Rename variables to be more descriptive.",
            "optimize": "Optimize the code for performance.",
        }

        instruction = refactor_instructions.get(
            request.refactor_type, "Improve the code quality and readability."
        )

        prompt = f"""Refactor the following {request.language} code.
    Task: {instruction}

    Return ONLY valid JSON. Do not include markdown, prose, or explanations outside JSON.
    Required JSON schema:
    {{
      "refactored_code": "<full refactored code>",
      "explanation": "<brief explanation of changes>"
    }}

    Original Code:
    {request.code}

    Refactor (JSON):"""

        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": selected_model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                result = data.get("response", "").strip()
        else:
            raise ValueError("Unsupported provider")

        parsed = _extract_first_json_object(result)
        if parsed is None:
            refactored = result
            explanation = "See refactored code above."
        else:
            refactored = str(parsed.get("refactored_code", "")).strip()
            explanation = str(parsed.get("explanation", "")).strip()

        if not refactored:
            refactored = result
        if not explanation:
            explanation = "See refactored code above."

        return CodeRefactorResponse(
            refactored_code=refactored,
            explanation=explanation,
        )

    except Exception as e:
        logger.error(f"Refactoring error: {e}")
        raise HTTPException(status_code=500, detail=f"Refactoring failed: {str(e)}")


# ===========================
# AI Documentation Generation
# ===========================

@app.post("/generate-docs", response_model=DocGenerationResponse)
async def generate_docs(request: DocGenerationRequest):
    """
    Generate docstrings and comments for code.
    """
    try:
        selected_model, _ = await _select_runtime_model("", "general", request.language)

        style_guidance = {
            "google": "Use Google-style docstrings with Args, Returns, Raises sections.",
            "numpy": "Use NumPy-style docstrings.",
            "sphinx": "Use Sphinx-style docstrings.",
        }

        style = style_guidance.get(request.style, "Use clear and concise docstrings.")

        prompt = f"""Generate comprehensive documentation for the following {request.language} code.
    Style: {style}

    Return ONLY valid JSON. Do not include markdown, prose, or explanations outside JSON.
    Required JSON schema:
    {{
      "documentation": "<documented code output>"
    }}

    Code:
    {request.code}

    Documentation (JSON):"""

        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": selected_model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw_output = data.get("response", "").strip()
        else:
            raise ValueError("Unsupported provider")

        parsed = _extract_first_json_object(raw_output)
        if parsed is None:
            documentation = _normalize_documentation_output(raw_output)
        else:
            documentation_value = parsed.get("documentation", raw_output)
            documentation = _normalize_documentation_output(documentation_value)

        return DocGenerationResponse(documentation=documentation)

    except Exception as e:
        logger.error(f"Doc generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Doc generation failed: {str(e)}")


# ===========================
# AI Chat Assistant
# ===========================

@app.post("/chat", response_model=ChatAssistResponse)
async def chat_assist(request: ChatAssistRequest):
    """Chat endpoint for code-focused local AI assistance."""
    try:
        requested_model, code_context, messages = _prepare_chat_messages(request)
        selected_model, model_selection_reason = await _select_runtime_model(
            requested_model=requested_model,
            purpose="chat",
            language=request.language,
        )

        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": selected_model,
                        "messages": messages,
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": 0.2,
                            "top_p": 0.9,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw_output = data.get("message", {}).get("content", "").strip()
        else:
            raise ValueError("Unsupported provider")

        return await _finalize_chat_result(
            request,
            selected_model,
            model_selection_reason,
            code_context,
            raw_output,
        )

    except Exception as e:
        logger.error(f"Chat assist error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat assist failed: {str(e)}")


@app.post("/chat/stream")
async def chat_assist_stream(request: ChatAssistRequest):
    """Streaming chat endpoint for conversational UX (NDJSON events)."""
    if AI_PROVIDER != "ollama":
        raise HTTPException(status_code=400, detail="Streaming chat currently supports ollama only")

    requested_model, code_context, messages = _prepare_chat_messages(request)
    selected_model, model_selection_reason = await _select_runtime_model(
        requested_model=requested_model,
        purpose="chat",
        language=request.language,
    )

    async def event_generator():
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": selected_model,
                        "messages": messages,
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": 0.2,
                            "top_p": 0.9,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw_output = data.get("message", {}).get("content", "").strip()

            finalized = await _finalize_chat_result(
                request,
                selected_model,
                model_selection_reason,
                code_context,
                raw_output,
            )

            stream_text = finalized.message or ""
            chunk_size = 18
            for index in range(0, len(stream_text), chunk_size):
                piece = stream_text[index : index + chunk_size]
                yield json.dumps({"type": "chunk", "text": piece}) + "\n"
                await asyncio.sleep(0.015)

            yield json.dumps({"type": "done", "payload": finalized.model_dump()}) + "\n"

        except Exception as exc:
            logger.error(f"Chat stream error: {exc}")
            yield json.dumps({"type": "error", "message": str(exc)}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.post("/chat/apply-actions", response_model=ChatApplyActionsResponse)
async def chat_apply_actions(request: ChatApplyActionsRequest):
    """Apply proposed file actions and store undo transaction."""
    try:
        actions_executed, action_errors, undo_ops = _apply_file_actions(request.actions, capture_undo=True)

        history_id = None
        if undo_ops and not action_errors:
            ACTION_HISTORY.append({"undo_ops": undo_ops})
            history_id = len(ACTION_HISTORY)

        return ChatApplyActionsResponse(
            actions_executed=actions_executed,
            action_errors=action_errors,
            history_id=history_id,
        )
    except Exception as e:
        logger.error(f"Chat apply actions error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat apply actions failed: {str(e)}")


@app.post("/chat/undo-last", response_model=ChatUndoResponse)
async def chat_undo_last():
    """Undo the most recent applied chat file-action transaction."""
    try:
        if not ACTION_HISTORY:
            return ChatUndoResponse(undone=[], errors=["No actions to undo"], history_id=None)

        transaction = ACTION_HISTORY.pop()
        undo_ops = transaction.get("undo_ops", [])
        undone, errors = _undo_action_transaction(undo_ops)

        history_id = len(ACTION_HISTORY)
        return ChatUndoResponse(undone=undone, errors=errors, history_id=history_id)
    except Exception as e:
        logger.error(f"Chat undo error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat undo failed: {str(e)}")


@app.post("/chat/preview-actions", response_model=ChatPreviewActionsResponse)
async def chat_preview_actions(request: ChatPreviewActionsRequest):
    """Preview file changes for proposed chat actions without applying them."""
    try:
        previews, errors = _build_action_previews(request.actions)
        return ChatPreviewActionsResponse(previews=previews, errors=errors)
    except Exception as e:
        logger.error(f"Chat preview actions error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat preview actions failed: {str(e)}")


# ===========================
# Model Info Endpoint
# ===========================

@app.get("/models")
async def list_models():
    """
    List available models from Ollama/vLLM.
    Useful for UI dropdown to switch models.
    """
    try:
        if AI_PROVIDER == "ollama":
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
                response.raise_for_status()
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                recommended, reason = await _select_runtime_model("", "chat", "python")
                return {
                    "provider": "ollama",
                    "models": models,
                    "recommended_chat_model": recommended,
                    "recommended_reason": reason,
                    "adaptive_model_routing": ADAPTIVE_MODEL_ROUTING,
                    "detected_gpu_vram_gb": _detect_gpu_vram_gb(),
                }
        else:
            return {
                "provider": "vllm",
                "models": [DEFAULT_MODEL],
                "recommended_chat_model": DEFAULT_MODEL,
                "recommended_reason": "vllm provider",
                "adaptive_model_routing": ADAPTIVE_MODEL_ROUTING,
                "detected_gpu_vram_gb": _detect_gpu_vram_gb(),
            }

    except Exception as e:
        logger.warning(f"Could not fetch models: {e}")
        return {
            "provider": AI_PROVIDER,
            "models": [DEFAULT_MODEL],
            "recommended_chat_model": DEFAULT_MODEL,
            "recommended_reason": "fallback",
            "adaptive_model_routing": ADAPTIVE_MODEL_ROUTING,
            "detected_gpu_vram_gb": _detect_gpu_vram_gb(),
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8888, log_level="info")
