const fsp = require("fs/promises");
const path = require("path");

const { runProviderChain } = require("./aiProviderChain");
const { applyOperationBatch } = require("./agentFileOps");
const { selectClaudeModel } = require("./agentModelSelector");
const { shouldIgnoreExplorerEntry, resolveWorkspacePath } = require("../utils/pathUtils");

function safeJsonParse(text) {
  const source = String(text || "").trim();
  if (!source) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch {
    const fenced = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
    if (!fenced) {
      return null;
    }
    try {
      return JSON.parse(fenced[1]);
    } catch {
      const firstBrace = source.indexOf("{");
      const lastBrace = source.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(source.slice(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeOperations(operations) {
  if (!Array.isArray(operations)) {
    return [];
  }

  const normalized = [];
  for (const operation of operations) {
    const op = String(operation?.op || "").trim().toLowerCase();
    if (!["create", "edit", "delete", "rename"].includes(op)) {
      continue;
    }

    const base = {
      op,
      path: String(operation.path || "").trim().replace(/\\/g, "/"),
    };

    if (!base.path) {
      continue;
    }

    if (op === "create" || op === "edit") {
      base.content = String(operation.content || "");
    }
    if (op === "rename") {
      base.newPath = String(operation.newPath || "").trim().replace(/\\/g, "/");
      if (!base.newPath) {
        continue;
      }
    }

    normalized.push(base);
  }

  return normalized;
}

function getOperationRisk(operation) {
  const op = String(operation?.op || "").toLowerCase();
  const pathValue = String(operation?.path || "").toLowerCase();
  const newPathValue = String(operation?.newPath || "").toLowerCase();
  const target = `${pathValue} ${newPathValue}`;

  if (op === "delete") {
    return "high";
  }

  if (
    target.includes("package.json") ||
    target.includes("backend/config.js") ||
    target.includes("backend/app.js") ||
    target.includes(".env") ||
    target.includes("render.yaml")
  ) {
    return "high";
  }

  if (op === "rename") {
    return "medium";
  }

  return "low";
}

function inferFallbackOperations(prompt) {
  const source = String(prompt || "").trim();
  if (!source) {
    return [];
  }

  const createMatch = source.match(
    /(?:create|add|make)\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?([\w./\\-]+)\s+(?:with\s+content|containing)\s+([\s\S]+)/i
  );
  if (createMatch) {
    return normalizeOperations([
      {
        op: "create",
        path: createMatch[1],
        content: createMatch[2],
      },
    ]);
  }

  const deleteMatch = source.match(/(?:delete|remove)\s+(?:the\s+)?(?:file\s+)?([\w./\\-]+)/i);
  if (deleteMatch) {
    return normalizeOperations([
      {
        op: "delete",
        path: deleteMatch[1],
      },
    ]);
  }

  const renameMatch = source.match(
    /(?:rename|move)\s+(?:the\s+)?(?:file\s+)?([\w./\\-]+)\s+(?:to|as)\s+([\w./\\-]+)/i
  );
  if (renameMatch) {
    return normalizeOperations([
      {
        op: "rename",
        path: renameMatch[1],
        newPath: renameMatch[2],
      },
    ]);
  }

  return [];
}

function normalizeBlueprintPayload(parsed, fallbackPrompt = "") {
  const operations = normalizeOperations(parsed?.operations);
  const fallbackOperations = operations.length > 0 ? [] : inferFallbackOperations(fallbackPrompt);
  const normalizedOperations = operations.length > 0 ? operations : fallbackOperations;

  return {
    title: String(parsed?.title || "Blueprint").trim() || "Blueprint",
    steps: normalizeStringArray(parsed?.steps),
    operations: normalizedOperations,
    notes: normalizeStringArray(parsed?.notes),
    used_fallback_operations: operations.length === 0 && fallbackOperations.length > 0,
  };
}

function buildModelSelectionMeta(source, modelSelection) {
  const provider = String(source || "").trim().toLowerCase();
  if (provider === "claude") {
    return {
      requested_model: modelSelection.requestedModel,
      effective_model: modelSelection.effectiveModel,
      model_selection_mode: modelSelection.selectionMode,
      model_selection_reason: modelSelection.reason,
    };
  }

  return {
    requested_model: modelSelection.requestedModel,
    effective_model: "",
    model_selection_mode: "skipped",
    model_selection_reason: `provider:${provider || "unknown"}`,
  };
}

async function buildWorkspaceSnippet(workspaceRoot, options = {}) {
  const query = String(options.query || "").trim().toLowerCase();
  const maxResults = Number(options.maxResults || 40);
  const maxFileBytes = Number(options.maxFileBytes || 200000);
  const stack = [""];
  const results = [];

  while (stack.length && results.length < maxResults) {
    const relDir = stack.pop();
    const dirPath = resolveWorkspacePath(relDir, workspaceRoot);
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) {
        break;
      }

      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (shouldIgnoreExplorerEntry(entry.name, relPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(relPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = resolveWorkspacePath(relPath, workspaceRoot);
      const stat = await fsp.stat(absolutePath);
      if (stat.size > maxFileBytes) {
        continue;
      }

      const content = await fsp.readFile(absolutePath, "utf8");
      if (!query || content.toLowerCase().includes(query) || relPath.toLowerCase().includes(query)) {
        const snippet = content.split(/\r?\n/).slice(0, 120).join("\n");
        results.push({ path: relPath, snippet });
      }
    }
  }

  return results;
}

function createAgentWorkflowService({ config, workspaceRoot, undoStore }) {
  /**
   * Parse and validate context chips array
   */
  function parseContextChips(contextChipsArray) {
    if (!Array.isArray(contextChipsArray)) {
      return "";
    }

    let totalBytes = 0;
    let fileCount = 0;
    const parts = [];

    for (const chip of contextChipsArray) {
      if (!chip || typeof chip !== "object") continue;

      const { type, path, content, startLine, endLine, label } = chip;
      if (!type || !["file", "selection", "terminal", "search", "tab"].includes(type)) continue;

      // Validate path (no directory traversal)
      if (path && (path.includes("..") || path.startsWith("/"))) {
        console.warn("Rejecting chip with invalid path:", path);
        continue;
      }

      const contentStr = String(content || "");
      const contentBytes = Buffer.byteLength(contentStr, "utf8");

      // Check individual chip size
      if (contentBytes > Number(config.AGENT_SEARCH_MAX_FILE_BYTES || 200000)) {
        console.warn("Chip content exceeds max size, truncating:", label);
        parts.push(`[TRUNCATED: ${label}]`);
        continue;
      }

      totalBytes += contentBytes;
      if (totalBytes > Number(config.AGENT_CONTEXT_MAX_TOTAL_BYTES || 500000)) {
        console.warn("Total context exceeds max bytes, stopping chip parsing");
        break;
      }

      if (type === "file") {
        fileCount++;
        if (fileCount > Number(config.AGENT_CONTEXT_MAX_FILES || 10)) {
          console.warn("Exceeded max files in context");
          break;
        }
        parts.push(`FILE: ${label || path}\n${contentStr}`);
      } else if (type === "selection") {
        parts.push(`SELECTION (${label || path}, lines ${startLine}-${endLine}):\n${contentStr}`);
      } else if (type === "terminal") {
        parts.push(`TERMINAL OUTPUT:\n${contentStr}`);
      } else {
        parts.push(`${type.toUpperCase()}: ${label}\n${contentStr}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n---\n\n") : "";
  }

  async function consult({ prompt, context = "", preferredProvider = "", preferredModel = "auto", contextChips = [] }) {
    // Parse context chips if provided
    let contextStr = context ? String(context) : "";
    if (Array.isArray(contextChips) && contextChips.length > 0) {
      const parsedContext = parseContextChips(contextChips);
      contextStr = contextStr ? `${contextStr}\n\n---\n\n${parsedContext}` : parsedContext;
    }

    const modelSelection = selectClaudeModel({
      preferredModel,
      prompt,
      context: contextStr,
      config,
    });

    const compiledPrompt = [
      "You are Consult mode for a coding assistant.",
      "Return strict JSON only with this shape:",
      '{"ready_to_plan":boolean,"summary":string,"questions":string[],"tradeoffs":string[]}',
      "Ask targeted clarification questions when requirements are ambiguous.",
      "Always include 1-3 tradeoffs or recommendations.",
      "User request:",
      prompt,
      contextStr ? `Context:\n${contextStr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await runProviderChain(config, {
      prompt: compiledPrompt,
      model: modelSelection.effectiveModel,
      preferredProvider,
    });

    const parsed = safeJsonParse(result.response);
    const modelMeta = buildModelSelectionMeta(result.source, modelSelection);
    if (parsed) {
      return {
        source: result.source,
        ...modelMeta,
        ready_to_plan: Boolean(parsed.ready_to_plan),
        summary: String(parsed.summary || ""),
        questions: Array.isArray(parsed.questions) ? parsed.questions.map((x) => String(x)) : [],
        tradeoffs: Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs.map((x) => String(x)) : [],
      };
    }

    return {
      source: result.source,
      ...modelMeta,
      ready_to_plan: false,
      summary: String(result.response || ""),
      questions: ["Can you confirm the exact files and desired behavior changes?"],
      tradeoffs: [],
      raw: result.response,
    };
  }

  async function blueprint({ prompt, context = "", preferredProvider = "", preferredModel = "auto", contextChips = [] }) {
    // Parse context chips if provided
    let contextStr = context ? String(context) : "";
    if (Array.isArray(contextChips) && contextChips.length > 0) {
      const parsedContext = parseContextChips(contextChips);
      contextStr = contextStr ? `${contextStr}\n\n---\n\n${parsedContext}` : parsedContext;
    }

    const modelSelection = selectClaudeModel({
      preferredModel,
      prompt,
      context: contextStr,
      config,
    });

    const basePrompt = [
      "You are Blueprint mode for a coding assistant.",
      "Return strict JSON only with this shape:",
      '{"title":string,"steps":string[],"operations":[{"op":"create|edit|delete|rename","path":string,"newPath?":string,"content?":string}],"notes":string[]}',
      "Only output operations that are safe and inside workspace-relative paths.",
      "Do not include markdown fences, prose, or comments.",
      "User request:",
      prompt,
      contextStr ? `Context:\n${contextStr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const maxAttempts = Math.max(1, Number(config.AGENT_BLUEPRINT_MAX_ATTEMPTS || 2));
    let lastSource = "";
    let lastResponse = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const repairInstruction =
        attempt === 1
          ? ""
          : "Repair attempt: previous output was invalid or lacked operations. Return valid JSON with at least one actionable operation when feasible.";
      const compiledPrompt = [basePrompt, repairInstruction].filter(Boolean).join("\n\n");

      const result = await runProviderChain(config, {
        prompt: compiledPrompt,
        model: modelSelection.effectiveModel,
        preferredProvider,
      });

      lastSource = result.source;
      lastResponse = String(result.response || "");
      const parsed = safeJsonParse(lastResponse);
      if (!parsed) {
        continue;
      }

      const normalized = normalizeBlueprintPayload(parsed, prompt);
      const modelMeta = buildModelSelectionMeta(lastSource, modelSelection);
      if (normalized.operations.length > 0 || attempt === maxAttempts) {
        return {
          source: lastSource,
          ...modelMeta,
          ...normalized,
          attempts: attempt,
        };
      }
    }

    const fallback = normalizeBlueprintPayload({}, prompt);
    const modelMeta = buildModelSelectionMeta(lastSource, modelSelection);
    return {
      source: lastSource,
      ...modelMeta,
      ...fallback,
      attempts: maxAttempts,
      notes: [
        ...fallback.notes,
        "AI returned non-JSON or operation-empty blueprint.",
        lastResponse || "No model response captured.",
      ],
    };
  }

  async function forge({ operations, summary = "", mode = "", allowHighRisk = null, preferredModel = "auto", preferredProvider = "" }) {
    const normalizedOperations = normalizeOperations(operations);
    const executionMode = "stop_on_error";
    const highRiskAllowed =
      allowHighRisk == null ? Boolean(config.AGENT_ALLOW_HIGH_RISK_DEFAULT) : Boolean(allowHighRisk);

    const highRiskBlocked = normalizedOperations
      .map((operation, index) => ({ operation, index, risk: getOperationRisk(operation) }))
      .filter((entry) => entry.risk === "high");

    if (highRiskBlocked.length > 0 && !highRiskAllowed) {
      return {
        undoId: "",
        requested_model: preferredModel,
        preferred_provider: preferredProvider,
        mode: executionMode,
        stoppedOnError: true,
        requiresUserResolution: true,
        blockedByRiskPolicy: true,
        results: highRiskBlocked.map((entry) => ({
          op: entry.operation.op,
          path: entry.operation.path,
          newPath: entry.operation.newPath || "",
          success: false,
          code: "HIGH_RISK_BLOCKED",
          error: "Operation blocked by server risk policy. Set allow_high_risk=true to proceed.",
          index: entry.index,
        })),
        successCount: 0,
        failureCount: highRiskBlocked.length,
      };
    }

    const { results, inverseOperations, stoppedOnError } = await applyOperationBatch(workspaceRoot, normalizedOperations, {
      mode: executionMode,
    });
    const successfulOps = results.filter((item) => item.success);

    const undoId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (successfulOps.length > 0 && inverseOperations.length > 0) {
      await undoStore.addEntry({
        undoId,
        createdAt: new Date().toISOString(),
        summary: String(summary || "Forge execution"),
        inverseOperations,
      });
    }

    return {
      undoId: successfulOps.length > 0 ? undoId : "",
      requested_model: preferredModel,
      preferred_provider: preferredProvider,
      mode: executionMode,
      stoppedOnError,
      requiresUserResolution: results.some((item) => !item.success) && stoppedOnError,
      blockedByRiskPolicy: false,
      results,
      successCount: successfulOps.length,
      failureCount: results.length - successfulOps.length,
    };
  }

  async function undo({ undoId, preferredModel = "auto", preferredProvider = "" }) {
    const entry = await undoStore.removeEntry(undoId);
    if (!entry) {
      return {
        success: false,
        requested_model: preferredModel,
        preferred_provider: preferredProvider,
        error: "Undo entry not found.",
      };
    }

    const reverseOps = Array.isArray(entry.inverseOperations) ? [...entry.inverseOperations].reverse() : [];
    const { results } = await applyOperationBatch(workspaceRoot, reverseOps);
    const failed = results.filter((item) => !item.success).length;

    return {
      success: failed === 0,
      requested_model: preferredModel,
      preferred_provider: preferredProvider,
      results,
      failureCount: failed,
    };
  }

  async function search({ query, preferredModel = "auto", preferredProvider = "" }) {
    const matches = await buildWorkspaceSnippet(workspaceRoot, {
      query,
      maxResults: config.AGENT_SEARCH_MAX_RESULTS,
      maxFileBytes: config.AGENT_SEARCH_MAX_FILE_BYTES,
    });
    return {
      query: String(query || ""),
      requested_model: preferredModel,
      preferred_provider: preferredProvider,
      matches,
    };
  }

  async function listUndoHistory({ preferredModel = "auto", preferredProvider = "" } = {}) {
    const entries = await undoStore.listEntries();
    return {
      requested_model: preferredModel,
      preferred_provider: preferredProvider,
      entries,
    };
  }

  return {
    consult,
    blueprint,
    forge,
    undo,
    search,
    listUndoHistory,
  };
}

module.exports = {
  createAgentWorkflowService,
};
