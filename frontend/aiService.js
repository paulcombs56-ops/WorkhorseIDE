/**
 * Workhorse IDE - AI Service
 *
 * Frontend service for calling Workhorse AI features.
 * Supports legacy /ai proxy and provider-chain /api/ai transport.
 */

const AI_BASE_URL = "http://localhost:3001/ai"; // Node.js backend proxy
const WORKHORSE_BASE_URL = "http://localhost:3001";
const PROVIDER_AI_BASE_URL = `${WORKHORSE_BASE_URL}/api/ai`;
const AGENT_API_BASE_URL = `${WORKHORSE_BASE_URL}/api/agent`;
const CHAT_TRANSPORT_KEY = "workhorse-chat-transport";
const PROVIDER_PREFERENCE_KEY = "workhorse-provider-preference";
const AGENT_CLAUDE_MODEL_KEY = "workhorse-agent-claude-model";
const USER_AUTH_TOKEN_KEY = "workhorse-user-auth-token";
const DESKTOP_SECRET_PROVIDER_PREFERENCE = "provider-preference";

const desktopState = {
  initialized: false,
  providerPreference: String(localStorage.getItem(PROVIDER_PREFERENCE_KEY) || "auto").trim().toLowerCase(),
  agentClaudeModel: String(localStorage.getItem(AGENT_CLAUDE_MODEL_KEY) || "auto").trim().toLowerCase(),
};

function isElectronRuntime() {
  return Boolean(window.workhorseElectron && window.workhorseElectron.isElectron);
}

async function initializeDesktopSecrets() {
  if (!isElectronRuntime() || desktopState.initialized) {
    return;
  }

  try {
    const providerPreference = await window.workhorseElectron.getSecret(DESKTOP_SECRET_PROVIDER_PREFERENCE);

    const normalizedPreference = ["auto", "claude", "ollama", "groq", "openai"].includes(
      String(providerPreference || "auto").trim().toLowerCase()
    )
      ? String(providerPreference || "auto").trim().toLowerCase()
      : "auto";
    desktopState.providerPreference = normalizedPreference;
    localStorage.setItem(PROVIDER_PREFERENCE_KEY, normalizedPreference);
  } catch (error) {
    console.warn("Desktop secret initialization failed:", error);
  } finally {
    desktopState.initialized = true;
  }
}

initializeDesktopSecrets();

function getWorkhorseAuthHeaders() {
  const legacyToken = String(localStorage.getItem("workhorse-api-token") || "").trim();
  const userToken = String(localStorage.getItem(USER_AUTH_TOKEN_KEY) || "").trim();
  const headers = {};
  if (legacyToken) {
    headers["x-workhorse-token"] = legacyToken;
  }
  if (userToken) {
    headers.Authorization = `Bearer ${userToken}`;
  }
  return headers;
}

function getStoredChatTransport() {
  const value = String(localStorage.getItem(CHAT_TRANSPORT_KEY) || "agent").trim().toLowerCase();
  if (value === "provider") {
    return "provider";
  }
  return "agent";
}

function getStoredProviderPreference() {
  const value = String(desktopState.providerPreference || localStorage.getItem(PROVIDER_PREFERENCE_KEY) || "auto")
    .trim()
    .toLowerCase();
  return ["auto", "claude", "ollama", "groq", "openai"].includes(value) ? value : "auto";
}

function getProviderRequestHeaders() {
  return {};
}

function getStoredAgentClaudeModel() {
  const value = String(desktopState.agentClaudeModel || localStorage.getItem(AGENT_CLAUDE_MODEL_KEY) || "auto")
    .trim()
    .toLowerCase();
  return ["auto", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"].includes(value)
    ? value
    : "auto";
}

function buildProviderPrompt(message, language, codeContext, history = [], complexMode = false) {
  const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
  const historyText = recentHistory
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content || ""}`)
    .join("\n");

  const complexityHint = complexMode
    ? "Provide a step-by-step, implementation-ready answer."
    : "Provide a concise, practical answer.";

  return [
    `You are helping with ${language || "code"}.`,
    complexityHint,
    historyText ? `Recent conversation:\n${historyText}` : "",
    codeContext ? `Current editor context:\n${codeContext}` : "",
    `User request:\n${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

window.aiService = {
  getUserAuthToken() {
    return String(localStorage.getItem(USER_AUTH_TOKEN_KEY) || "").trim();
  },

  setUserAuthToken(token = "") {
    const normalized = String(token || "").trim();
    if (!normalized) {
      localStorage.removeItem(USER_AUTH_TOKEN_KEY);
      return "";
    }
    localStorage.setItem(USER_AUTH_TOKEN_KEY, normalized);
    return normalized;
  },

  clearUserAuthToken() {
    localStorage.removeItem(USER_AUTH_TOKEN_KEY);
  },

  async authRegister(email, password, name = "") {
    const response = await fetch(`${WORKHORSE_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.token) {
      this.setUserAuthToken(payload.token);
    }
    return payload;
  },

  async authLogin(email, password) {
    const response = await fetch(`${WORKHORSE_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.token) {
      this.setUserAuthToken(payload.token);
    }
    return payload;
  },

  async authMe() {
    const response = await fetch(`${WORKHORSE_BASE_URL}/api/auth/me`, {
      headers: {
        ...getWorkhorseAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  },

  getChatTransport() {
    return getStoredChatTransport();
  },

  setChatTransport(transport = "agent") {
    const normalized = String(transport || "agent").trim().toLowerCase() === "provider" ? "provider" : "agent";
    localStorage.setItem(CHAT_TRANSPORT_KEY, normalized);
    return normalized;
  },

  async initializeDesktopSecrets() {
    await initializeDesktopSecrets();
    return {
      providerPreference: getStoredProviderPreference(),
    };
  },

  getProviderPreference() {
    return getStoredProviderPreference();
  },

  setProviderPreference(preference = "auto") {
    const normalized = ["auto", "claude", "ollama", "groq", "openai"].includes(
      String(preference || "auto").trim().toLowerCase()
    )
      ? String(preference || "auto").trim().toLowerCase()
      : "auto";
    desktopState.providerPreference = normalized;
    localStorage.setItem(PROVIDER_PREFERENCE_KEY, normalized);
    if (isElectronRuntime()) {
      window.workhorseElectron.setSecret(DESKTOP_SECRET_PROVIDER_PREFERENCE, normalized).catch(() => {});
    }
    return normalized;
  },

  getAgentClaudeModel() {
    return getStoredAgentClaudeModel();
  },

  setAgentClaudeModel(model = "auto") {
    const normalized = ["auto", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"].includes(
      String(model || "auto").trim().toLowerCase()
    )
      ? String(model || "auto").trim().toLowerCase()
      : "auto";
    desktopState.agentClaudeModel = normalized;
    localStorage.setItem(AGENT_CLAUDE_MODEL_KEY, normalized);
    return normalized;
  },

  /**
   * Get AI backend health status
   */
  async checkHealth() {
    try {
      const response = await fetch(`${AI_BASE_URL}/health`);
      return await response.json();
    } catch (error) {
      console.error("AI backend healthy check failed:", error);
      return { status: "offline", error: error.message };
    }
  },

  async checkProviderHealth() {
    try {
      const response = await fetch(`${PROVIDER_AI_BASE_URL}/health`, {
        headers: getProviderRequestHeaders(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Provider health check failed:", error);
      return { status: "offline", error: error.message, providers: [] };
    }
  },

  /**
   * Get code completion suggestions
   * Uses GPU-accelerated local LLM (CodeLlama, Mistral, etc.)
   */
  async getCodeCompletion(code, language, cursorPosition, contextLines = 10) {
    const request = {
      code,
      language,
      cursor_position: cursorPosition,
      context_lines: contextLines,
    };

    try {
      const response = await fetch(`${AI_BASE_URL}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        completion: data.completion,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error("Completion request failed:", error);
      return { completion: "", confidence: 0 };
    }
  },

  /**
   * Analyze code for bugs, issues, and suggestions
   * Uses GPU-accelerated local analysis model
   */
  async analyzeCode(code, language) {
    const request = { code, language };

    try {
      const response = await fetch(`${AI_BASE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        issues: data.issues || [],
        suggestions: data.suggestions || [],
      };
    } catch (error) {
      console.error("Analysis request failed:", error);
      return { issues: [], suggestions: [] };
    }
  },

  /**
   * Refactor code using AI
   * Supports: extract-function, simplify, rename-variable, optimize
   */
  async refactorCode(code, language, refactorType = "simplify") {
    const request = { code, language, refactor_type: refactorType };

    try {
      const response = await fetch(`${AI_BASE_URL}/refactor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        refactored_code: data.refactored_code,
        explanation: data.explanation,
      };
    } catch (error) {
      console.error("Refactor request failed:", error);
      return { refactored_code: code, explanation: "" };
    }
  },

  /**
   * Generate documentation for code
   * Supports: google, numpy, sphinx styles
   */
  async generateDocumentation(code, language, style = "google") {
    const request = { code, language, style };

    try {
      const response = await fetch(`${AI_BASE_URL}/generate-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { documentation: data.documentation };
    } catch (error) {
      console.error("Doc generation request failed:", error);
      return { documentation: "" };
    }
  },

  /**
   * Chat-based coding assistant
   * Returns conversational guidance and optional code snippet.
   */
  async chatAssist(
    message,
    language,
    codeContext = "",
    history = [],
    enableFileActions = true,
    model = "",
    complexMode = false,
    autoApplyActions = false
  ) {
    if (getStoredChatTransport() === "provider") {
      try {
        const prompt = buildProviderPrompt(message, language, codeContext, history, complexMode);
        const preferredProvider = getStoredProviderPreference();
        const response = await fetch(PROVIDER_AI_BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getProviderRequestHeaders(),
          },
          body: JSON.stringify({
            prompt,
            model: model || undefined,
            preferred_provider: preferredProvider !== "auto" ? preferredProvider : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
          message: data.response || "No response.",
          code: "",
          actions_proposed: [],
          actions_executed: [],
          action_errors: [],
          history_id: null,
          plan: [],
          verification_commands: [],
          selected_model: model || "",
          model_selection_reason: `provider:${data.source || "unknown"}`,
        };
      } catch (error) {
        console.error("Provider chat request failed:", error);
        return {
          message: "Provider chat is currently unavailable.",
          code: "",
          actions_proposed: [],
          actions_executed: [],
          action_errors: [error.message],
          history_id: null,
          plan: [],
          verification_commands: [],
          selected_model: model || "",
          model_selection_reason: "provider:error",
        };
      }
    }

    const request = {
      message,
      language,
      code_context: codeContext,
      history,
      enable_file_actions: enableFileActions,
      auto_apply_actions: Boolean(autoApplyActions),
      complex_mode: Boolean(complexMode),
    };

    if (model) {
      request.model = model;
    }

    try {
      const response = await fetch(`${AI_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        message: data.message || "No response.",
        code: data.code || "",
        actions_proposed: data.actions_proposed || [],
        actions_executed: data.actions_executed || [],
        action_errors: data.action_errors || [],
        history_id: data.history_id || null,
        plan: data.plan || [],
        verification_commands: data.verification_commands || [],
        selected_model: data.selected_model || "",
        model_selection_reason: data.model_selection_reason || "",
      };
    } catch (error) {
      console.error("Chat assist request failed:", error);
      return {
        message: "Chat assistant is currently unavailable.",
        code: "",
        actions_proposed: [],
        actions_executed: [],
        action_errors: [error.message],
        history_id: null,
        plan: [],
        verification_commands: [],
        selected_model: "",
        model_selection_reason: "",
      };
    }
  },

  async streamChatAssist(
    message,
    language,
    codeContext = "",
    history = [],
    enableFileActions = true,
    model = "",
    complexMode = false,
    autoApplyActions = false,
    handlers = {}
  ) {
    const onChunk = handlers.onChunk || (() => {});
    const onDone = handlers.onDone || (() => {});
    const onError = handlers.onError || (() => {});

    if (getStoredChatTransport() === "provider") {
      try {
        const result = await this.chatAssist(
          message,
          language,
          codeContext,
          history,
          enableFileActions,
          model,
          complexMode,
          autoApplyActions
        );
        onChunk(result.message || "");
        onDone(result);
      } catch (error) {
        onError(error.message || "Provider chat request failed");
      }
      return;
    }

    const request = {
      message,
      language,
      code_context: codeContext,
      history,
      enable_file_actions: enableFileActions,
      auto_apply_actions: Boolean(autoApplyActions),
      complex_mode: Boolean(complexMode),
    };

    if (model) {
      request.model = model;
    }

    try {
      const response = await fetch(`${AI_BASE_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === "chunk") {
            onChunk(event.text || "");
          } else if (event.type === "done") {
            onDone(event.payload || {});
          } else if (event.type === "error") {
            onError(event.message || "Streaming error");
          }
        }
      }
    } catch (error) {
      console.error("Stream chat assist failed:", error);
      onError(error.message || "Streaming request failed");
    }
  },

  async applyChatActions(actions = []) {
    try {
      const response = await fetch(`${AI_BASE_URL}/chat/apply-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        actions_executed: data.actions_executed || [],
        action_errors: data.action_errors || [],
        history_id: data.history_id || null,
      };
    } catch (error) {
      console.error("Apply chat actions failed:", error);
      return {
        actions_executed: [],
        action_errors: [error.message],
        history_id: null,
      };
    }
  },

  async undoLastChatActions() {
    try {
      const response = await fetch(`${AI_BASE_URL}/chat/undo-last`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        undone: data.undone || [],
        errors: data.errors || [],
        history_id: data.history_id || null,
      };
    } catch (error) {
      console.error("Undo chat actions failed:", error);
      return {
        undone: [],
        errors: [error.message],
        history_id: null,
      };
    }
  },

  async previewChatActions(actions = []) {
    try {
      const response = await fetch(`${AI_BASE_URL}/chat/preview-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        previews: data.previews || [],
        errors: data.errors || [],
      };
    } catch (error) {
      console.error("Preview chat actions failed:", error);
      return {
        previews: [],
        errors: [error.message],
      };
    }
  },

  async agentConsult(prompt, context = "") {
    try {
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();
      const response = await fetch(`${AGENT_API_BASE_URL}/consult`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getWorkhorseAuthHeaders(),
          ...getProviderRequestHeaders(),
        },
        body: JSON.stringify({
          prompt,
          context,
          preferred_provider: preferredProvider !== "auto" ? preferredProvider : undefined,
          preferred_model: preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent consult request failed:", error);
      return {
        ready_to_plan: false,
        summary: "Consult request failed.",
        questions: [],
        tradeoffs: [error.message],
      };
    }
  },

  async agentBlueprint(prompt, context = "") {
    try {
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();
      const response = await fetch(`${AGENT_API_BASE_URL}/blueprint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getWorkhorseAuthHeaders(),
          ...getProviderRequestHeaders(),
        },
        body: JSON.stringify({
          prompt,
          context,
          preferred_provider: preferredProvider !== "auto" ? preferredProvider : undefined,
          preferred_model: preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent blueprint request failed:", error);
      return {
        title: "Blueprint failed",
        steps: [],
        operations: [],
        notes: [error.message],
      };
    }
  },

  async agentForge(operations = [], summary = "", options = {}) {
    try {
      const mode = "stop_on_error";
      const allowHighRisk = Boolean(options.allowHighRisk);
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();

      const response = await fetch(`${AGENT_API_BASE_URL}/forge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getWorkhorseAuthHeaders(),
        },
        body: JSON.stringify({
          operations,
          summary,
          mode,
          allow_high_risk: allowHighRisk,
          preferred_provider: preferredProvider !== "auto" ? preferredProvider : undefined,
          preferred_model: preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent forge request failed:", error);
      return {
        undoId: "",
        results: [],
        successCount: 0,
        failureCount: 1,
        error: error.message,
      };
    }
  },

  async agentUndo(undoId) {
    try {
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();
      const response = await fetch(`${AGENT_API_BASE_URL}/undo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getWorkhorseAuthHeaders(),
        },
        body: JSON.stringify({
          undoId,
          preferred_provider: preferredProvider !== "auto" ? preferredProvider : undefined,
          preferred_model: preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent undo request failed:", error);
      return {
        success: false,
        results: [],
        error: error.message,
      };
    }
  },

  async agentUndoHistory() {
    try {
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();
      const params = new URLSearchParams();
      if (preferredProvider !== "auto") {
        params.set("preferred_provider", preferredProvider);
      }
      params.set("preferred_model", preferredModel);
      const response = await fetch(`${AGENT_API_BASE_URL}/undo/history?${params.toString()}`, {
        headers: getWorkhorseAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent undo history request failed:", error);
      return {
        entries: [],
        error: error.message,
      };
    }
  },

  async agentSearch(query) {
    try {
      const preferredProvider = getStoredProviderPreference();
      const preferredModel = getStoredAgentClaudeModel();
      const params = new URLSearchParams();
      params.set("q", String(query || ""));
      if (preferredProvider !== "auto") {
        params.set("preferred_provider", preferredProvider);
      }
      params.set("preferred_model", preferredModel);
      const response = await fetch(`${AGENT_API_BASE_URL}/search?${params.toString()}`, {
        headers: getWorkhorseAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent search request failed:", error);
      return {
        query,
        matches: [],
        error: error.message,
      };
    }
  },

  /**
   * List available models on local Ollama/vLLM
   * Useful for UI to let user switch models
   */
  async listModels() {
    try {
      const response = await fetch(`${AI_BASE_URL}/models`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        provider: data.provider,
        models: data.models || [],
        recommended_chat_model: data.recommended_chat_model || "",
        recommended_reason: data.recommended_reason || "",
        adaptive_model_routing: Boolean(data.adaptive_model_routing),
        detected_gpu_vram_gb: data.detected_gpu_vram_gb ?? null,
      };
    } catch (error) {
      console.error("Model list request failed:", error);
      return {
        provider: "unknown",
        models: [],
        recommended_chat_model: "",
        recommended_reason: "",
        adaptive_model_routing: false,
        detected_gpu_vram_gb: null,
      };
    }
  },

  async getWorkspaceTree(depth = 4) {
    try {
      const response = await fetch(`${WORKHORSE_BASE_URL}/workspace-tree?depth=${encodeURIComponent(depth)}`, {
        headers: getWorkhorseAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        root: data.root || "",
        tree: data.tree || [],
      };
    } catch (error) {
      console.error("Workspace tree request failed:", error);
      return { root: "", tree: [], error: error.message };
    }
  },

  async getWorkspaceFile(relativePath) {
    try {
      const response = await fetch(
        `${WORKHORSE_BASE_URL}/workspace-file?path=${encodeURIComponent(relativePath || "")}`,
        {
          headers: getWorkhorseAuthHeaders(),
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        path: data.path || relativePath,
        content: data.content || "",
      };
    } catch (error) {
      console.error("Workspace file request failed:", error);
      return { path: relativePath || "", content: "", error: error.message };
    }
  },

  async launchExecutable(relativePath, args = []) {
    try {
      const response = await fetch(`${WORKHORSE_BASE_URL}/run-executable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getWorkhorseAuthHeaders(),
        },
        body: JSON.stringify({ path: relativePath, args }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        launched: Boolean(data.launched),
        path: data.path || relativePath,
        args: data.args || [],
        pid: data.pid || null,
      };
    } catch (error) {
      console.error("Executable launch request failed:", error);
      return {
        launched: false,
        path: relativePath || "",
        args: [],
        pid: null,
        error: error.message,
      };
    }
  },
};
