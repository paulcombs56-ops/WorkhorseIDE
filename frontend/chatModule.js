(function initWorkhorseChatModule(globalScope) {
  const agentWorkflowState = {
    blueprint: null,
    approved: false,
    lastUndoId: "",
    undoHistory: [],
    selectedOperationIndices: [],
    pendingForgeOperations: [],
    pendingForgeSummary: "",
  };

  function inferComplexMode(message, codeContext = "") {
    const text = `${String(message || "")}\n${String(codeContext || "")}`.toLowerCase();
    let score = 0;

    if (text.length > 450) score += 1;
    if (text.length > 1100) score += 2;
    if (/refactor|architecture|migrate|multi-file|regression|rollback|performance|security|integrat/i.test(text)) {
      score += 2;
    }
    if (/```|class\s+|function\s+|import\s+|select\s+.+\s+from\s+/i.test(text)) {
      score += 2;
    }

    return score >= 3;
  }

  async function initializeChatTransportSelector({ aiService, writeToConsole }) {
    const agentClaudeModelSelect = document.getElementById("agent-claude-model-select");

    if (!agentClaudeModelSelect) {
      return;
    }

    await aiService.initializeDesktopSecrets?.();

    aiService.setChatTransport?.("agent");
    aiService.setProviderPreference?.("auto");

    if (agentClaudeModelSelect) {
      agentClaudeModelSelect.value = aiService.getAgentClaudeModel?.() || "auto";
      agentClaudeModelSelect.addEventListener("change", (event) => {
        const selected = aiService.setAgentClaudeModel?.(event.target.value || "auto") || "auto";
        agentClaudeModelSelect.value = selected;
        writeToConsole(`Agent Claude model set to: ${selected}`, "log");
      });
    }
  }

  async function sendChatMessage(runtime) {
    const {
      aiService,
      chatHistory,
      getSelectedChatModel,
      appendChatMessage,
      isNearBottom,
      scrollToBottom,
      insertCodeIntoEditor,
      writeToConsole,
      setAiPanelOutput,
      loadFileExplorer,
    } = runtime;

    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const userMessage = input.value.trim();

    if (!userMessage) return;

    const language = document.getElementById("language-select").value;
    const codeContext = globalScope.editor ? globalScope.editor.getValue().slice(-6000) : "";
    const complexMode = inferComplexMode(userMessage, codeContext);
    const autoApplyActions = false;
    const autoInsertCode = false;

    appendChatMessage("user", userMessage);
    chatHistory.push({ role: "user", content: userMessage });

    const messages = document.getElementById("chat-messages");
    const stickToBottomOnStream = isNearBottom(messages);
    const liveBubble = document.createElement("div");
    liveBubble.classList.add("chat-message", "chat-assistant", "chat-live");
    liveBubble.textContent = "Thinking...";
    messages.appendChild(liveBubble);
    if (stickToBottomOnStream) {
      scrollToBottom(messages);
    }

    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;

    setAiPanelOutput("Generating chat response...");

    let streamedText = "";
    let streamCompleted = false;
    let donePayload = null;
    let streamError = "";

    const selectedChatModel = getSelectedChatModel();

    await aiService.streamChatAssist(
      userMessage,
      language,
      codeContext,
      chatHistory,
      true,
      selectedChatModel,
      complexMode,
      autoApplyActions,
      {
        onChunk: (text) => {
          const shouldAutoScrollChunk = isNearBottom(messages);
          streamedText += text;
          liveBubble.textContent = streamedText || "Thinking...";
          if (shouldAutoScrollChunk) {
            scrollToBottom(messages);
          }
        },
        onDone: (payload) => {
          streamCompleted = true;
          donePayload = payload;
        },
        onError: (errorMessage) => {
          streamError = errorMessage || "Streaming unavailable";
        },
      }
    );

    if (liveBubble.parentNode) {
      liveBubble.parentNode.removeChild(liveBubble);
    }

    if (!streamCompleted || !donePayload) {
      writeToConsole(`Stream fallback: ${streamError || "No stream payload"}`, "log");
      const fallbackResult = await aiService.chatAssist(
        userMessage,
        language,
        codeContext,
        chatHistory,
        true,
        selectedChatModel,
        complexMode,
        autoApplyActions
      );
      donePayload = fallbackResult;
    }

    const assistantMessage = donePayload.message || streamedText || "No response.";
    const assistantCode = donePayload.code || "";
    const actionsProposed = donePayload.actions_proposed || [];
    const actionsExecuted = donePayload.actions_executed || [];
    const actionErrors = donePayload.action_errors || [];
    const plan = donePayload.plan || [];
    const verificationCommands = donePayload.verification_commands || [];
    const selectedModel = donePayload.selected_model || selectedChatModel || "";
    const modelSelectionReason = donePayload.model_selection_reason || "";
    const chatTransport = aiService.getChatTransport();

    if (autoInsertCode && assistantCode) {
      insertCodeIntoEditor(assistantCode);
      writeToConsole("Auto-inserted generated code into editor.", "result");
    }

    appendChatMessage(
      "assistant",
      assistantMessage,
      assistantCode,
      actionsExecuted,
      actionErrors,
      actionsProposed,
      plan,
      verificationCommands
    );
    chatHistory.push({
      role: "assistant",
      content: assistantCode ? `${assistantMessage}\n\n${assistantCode}` : assistantMessage,
    });

    setAiPanelOutput(
      JSON.stringify(
        {
          message: assistantMessage,
          code: assistantCode,
          actions_proposed: actionsProposed,
          actions_executed: actionsExecuted,
          action_errors: actionErrors,
          plan,
          verification_commands: verificationCommands,
          complex_mode: complexMode,
          selected_model: selectedModel,
          model_selection_reason: modelSelectionReason,
          chat_transport: chatTransport,
          auto_apply_actions: autoApplyActions,
          auto_insert_code: autoInsertCode,
        },
        null,
        2
      )
    );

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();

    if (actionsProposed.length > 0) {
      await loadFileExplorer();
    }
  }

  function bindChatInputHandlers(runtime) {
    const sendBtn = document.getElementById("chat-send-btn");
    const input = document.getElementById("chat-input");

    if (!sendBtn || !input) {
      return;
    }

    sendBtn.addEventListener("click", () => {
      sendChatMessage(runtime);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage(runtime);
      }
    });
  }

  function bindAgentWorkflowHandlers(runtime) {
    const {
      aiService,
      appendChatMessage,
      setAiPanelOutput,
      writeToConsole,
      loadFileExplorer,
      getEditor,
    } = runtime;

    const requestInput = document.getElementById("agent-request-input");
    const consultBtn = document.getElementById("agent-consult-btn");
    const blueprintBtn = document.getElementById("agent-blueprint-btn");
    const approveBtn = document.getElementById("agent-approve-btn");
    const forgeBtn = document.getElementById("agent-forge-btn");
    const undoBtn = document.getElementById("agent-undo-btn");
    const historySelect = document.getElementById("agent-history-select");
    const historyRefreshBtn = document.getElementById("agent-history-refresh-btn");
    const historyUndoBtn = document.getElementById("agent-history-undo-btn");
    const forceHighRiskCheckbox = document.getElementById("agent-force-high-risk");
    const previewEl = document.getElementById("agent-blueprint-preview");
    const statusEl = document.getElementById("agent-workflow-status");
    const resolutionEl = document.getElementById("agent-resolution-actions");

    if (
      !requestInput ||
      !consultBtn ||
      !blueprintBtn ||
      !approveBtn ||
      !forgeBtn ||
      !undoBtn ||
      !historySelect ||
      !historyRefreshBtn ||
      !historyUndoBtn ||
      !forceHighRiskCheckbox ||
      !previewEl ||
      !statusEl ||
      !resolutionEl
    ) {
      return;
    }

    const cloneOperation = (operation = {}) => {
      const op = {
        op: String(operation.op || ""),
        path: String(operation.path || ""),
      };
      if (Object.prototype.hasOwnProperty.call(operation, "newPath")) {
        op.newPath = String(operation.newPath || "");
      }
      if (Object.prototype.hasOwnProperty.call(operation, "content")) {
        op.content = String(operation.content || "");
      }
      return op;
    };

    const getRiskLevel = (operation) => {
      const op = String(operation?.op || "").toLowerCase();
      const path = String(operation?.path || "").toLowerCase();
      const newPath = String(operation?.newPath || "").toLowerCase();
      const target = `${path} ${newPath}`;

      if (op === "delete") {
        return "high";
      }
      if (target.includes("package.json") || target.includes("backend/config.js") || target.includes("backend/app.js")) {
        return "high";
      }
      if (op === "rename" || target.includes(".env") || target.includes("tsconfig") || target.includes("render.yaml")) {
        return "medium";
      }
      return "low";
    };

    const getSelectedOperations = () => {
      const operations = Array.isArray(agentWorkflowState.blueprint?.operations)
        ? agentWorkflowState.blueprint.operations
        : [];
      const selectedSet = new Set(agentWorkflowState.selectedOperationIndices);
      return operations.filter((_, index) => selectedSet.has(index));
    };

    const getSelectedHighRiskCount = () => {
      return getSelectedOperations().filter((operation) => getRiskLevel(operation) === "high").length;
    };

    const canForgeNow = () => {
      const selectedCount = getSelectedOperations().length;
      const selectedHighRiskCount = getSelectedHighRiskCount();
      const forceHighRisk = Boolean(forceHighRiskCheckbox.checked);
      return agentWorkflowState.approved && selectedCount > 0 && (forceHighRisk || selectedHighRiskCount === 0);
    };

    const renderBlueprintPreview = () => {
      const operations = Array.isArray(agentWorkflowState.blueprint?.operations)
        ? agentWorkflowState.blueprint.operations
        : [];

      if (operations.length === 0) {
        previewEl.textContent = "No blueprint operations to preview yet.";
        return;
      }

      const table = document.createElement("table");
      table.className = "agent-blueprint-table";

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["Use", "#", "Op", "Path", "Risk"].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const toolbar = document.createElement("div");
      toolbar.className = "agent-blueprint-toolbar";

      const selectedCount = getSelectedOperations().length;
      const selectedHighRiskCount = getSelectedHighRiskCount();
      const summary = document.createElement("span");
      summary.className = "agent-blueprint-summary";
      summary.textContent = `${selectedCount}/${operations.length} selected`;
      toolbar.appendChild(summary);

      if (selectedHighRiskCount > 0 && !forceHighRiskCheckbox.checked) {
        const warning = document.createElement("span");
        warning.className = "agent-blueprint-warning";
        warning.textContent = `${selectedHighRiskCount} high-risk selected (blocked unless forced)`;
        toolbar.appendChild(warning);
      }

      const selectAllBtn = document.createElement("button");
      selectAllBtn.type = "button";
      selectAllBtn.textContent = "Select all";
      selectAllBtn.className = "agent-blueprint-mini-btn";
      selectAllBtn.onclick = () => {
        agentWorkflowState.selectedOperationIndices = operations.map((_, index) => index);
        agentWorkflowState.approved = false;
        renderBlueprintPreview();
        refreshWorkflowStatus();
      };
      toolbar.appendChild(selectAllBtn);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.textContent = "Clear";
      clearBtn.className = "agent-blueprint-mini-btn";
      clearBtn.onclick = () => {
        agentWorkflowState.selectedOperationIndices = [];
        agentWorkflowState.approved = false;
        renderBlueprintPreview();
        refreshWorkflowStatus();
      };
      toolbar.appendChild(clearBtn);

      const tbody = document.createElement("tbody");
      operations.forEach((operation, index) => {
        const row = document.createElement("tr");

        const useCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "agent-op-checkbox";
        checkbox.checked = agentWorkflowState.selectedOperationIndices.includes(index);
        checkbox.onchange = () => {
          const selected = new Set(agentWorkflowState.selectedOperationIndices);
          if (checkbox.checked) {
            selected.add(index);
          } else {
            selected.delete(index);
          }
          agentWorkflowState.selectedOperationIndices = Array.from(selected).sort((a, b) => a - b);
          agentWorkflowState.approved = false;
          refreshWorkflowStatus();
          renderBlueprintPreview();
        };
        useCell.appendChild(checkbox);
        row.appendChild(useCell);

        const indexCell = document.createElement("td");
        indexCell.textContent = String(index + 1);
        row.appendChild(indexCell);

        const opCell = document.createElement("td");
        opCell.textContent = String(operation.op || "");
        row.appendChild(opCell);

        const pathCell = document.createElement("td");
        const leftPath = String(operation.path || "");
        const rightPath = String(operation.newPath || "");
        pathCell.textContent = rightPath ? `${leftPath} -> ${rightPath}` : leftPath;
        row.appendChild(pathCell);

        const riskCell = document.createElement("td");
        const risk = getRiskLevel(operation);
        const chip = document.createElement("span");
        chip.className = `agent-risk agent-risk-${risk}`;
        chip.textContent = risk;
        riskCell.appendChild(chip);
        row.appendChild(riskCell);

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      previewEl.innerHTML = "";
      previewEl.appendChild(toolbar);
      previewEl.appendChild(table);
    };

    const renderUndoHistory = () => {
      const previousValue = historySelect.value;
      historySelect.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Undo history (latest first)";
      historySelect.appendChild(placeholder);

      agentWorkflowState.undoHistory.forEach((entry) => {
        const option = document.createElement("option");
        option.value = String(entry.undoId || "");
        const when = String(entry.createdAt || "").replace("T", " ").slice(0, 19);
        const count = Number(entry.operationCount || 0);
        const summary = String(entry.summary || "Forge execution");
        option.textContent = `${when} - ${summary} (${count} op${count === 1 ? "" : "s"})`;
        historySelect.appendChild(option);
      });

      if (previousValue && agentWorkflowState.undoHistory.some((entry) => entry.undoId === previousValue)) {
        historySelect.value = previousValue;
      }

      historyUndoBtn.disabled = !historySelect.value;
    };

    const loadUndoHistory = async () => {
      const result = await aiService.agentUndoHistory();
      agentWorkflowState.undoHistory = Array.isArray(result.entries) ? result.entries : [];
      renderUndoHistory();
    };

    const refreshWorkflowStatus = () => {
      const totalCount = Array.isArray(agentWorkflowState.blueprint?.operations)
        ? agentWorkflowState.blueprint.operations.length
        : 0;
      const selectedCount = getSelectedOperations().length;
      const selectedHighRiskCount = getSelectedHighRiskCount();
      if (agentWorkflowState.approved && selectedCount > 0 && selectedHighRiskCount > 0 && !forceHighRiskCheckbox.checked) {
        statusEl.textContent = `Blueprint approved (${selectedCount}/${totalCount}), but Forge blocked: ${selectedHighRiskCount} high-risk selected.`;
      } else if (agentWorkflowState.approved && selectedCount > 0) {
        statusEl.textContent = `Blueprint approved (${selectedCount}/${totalCount} selected). Ready to Forge.`;
      } else if (agentWorkflowState.blueprint && totalCount > 0) {
        statusEl.textContent = `Blueprint ready (${selectedCount}/${totalCount} selected). Click Approve Blueprint.`;
      } else {
        statusEl.textContent = "No blueprint approved.";
      }
    };

    const renderOperationTranscript = (results = []) => {
      if (!Array.isArray(results) || results.length === 0) {
        return "No operation transcript available.";
      }

      return results
        .map((entry, index) => {
          const op = String(entry.op || "unknown");
          const path = String(entry.path || "");
          const newPath = String(entry.newPath || "");
          const target = newPath ? `${path} -> ${newPath}` : path;
          if (entry.success) {
            return `${index + 1}. OK ${op} ${target}`.trim();
          }
          return `${index + 1}. FAIL ${op} ${target} :: ${String(entry.error || "unknown error")}`.trim();
        })
        .join("\n");
    };

    const clearResolutionActions = () => {
      resolutionEl.innerHTML = "";
      resolutionEl.hidden = true;
    };

    const runResolutionRetry = async (retryOperations, label) => {
      await withBusyState(async () => {
        const summary = `${agentWorkflowState.pendingForgeSummary || "Forge execution"} (${label})`;
        const allowHighRisk = Boolean(forceHighRiskCheckbox.checked);
        const result = await aiService.agentForge(retryOperations, summary, { allowHighRisk });
        agentWorkflowState.pendingForgeOperations = retryOperations.map(cloneOperation);
        agentWorkflowState.lastUndoId = String(result.undoId || "");
        if (agentWorkflowState.lastUndoId) {
          await loadUndoHistory();
        }

        appendChatMessage(
          "assistant",
          `Forge retry complete. Success: ${result.successCount || 0}, Failed: ${result.failureCount || 0}.`
        );
        appendChatMessage("assistant", `Forge transcript:\n${renderOperationTranscript(result.results || [])}`);

        if (result.requiresUserResolution) {
          renderResolutionActions(result, retryOperations);
        } else {
          clearResolutionActions();
        }

        setAiPanelOutput(JSON.stringify(result, null, 2));
        await loadFileExplorer();
      });
    };

    const renderResolutionActions = (result, sentOperations) => {
      clearResolutionActions();
      const results = Array.isArray(result?.results) ? result.results : [];
      const firstFailureIndex = results.findIndex((entry) => !entry.success);
      if (firstFailureIndex < 0) {
        return;
      }

      const failedEntry = results[firstFailureIndex] || {};
      const failedOperation = (Array.isArray(sentOperations) ? sentOperations : [])[firstFailureIndex] || {};
      const title = document.createElement("div");
      title.className = "agent-resolution-title";
      title.textContent = "Forge needs resolution";
      resolutionEl.appendChild(title);

      const message = document.createElement("div");
      message.className = "agent-resolution-message";
      message.textContent = `Failure code: ${String(failedEntry.code || "OPERATION_FAILED")}. ${String(
        failedEntry.error || "Please choose a resolution action."
      )}`;
      resolutionEl.appendChild(message);

      const buttons = document.createElement("div");
      buttons.className = "agent-resolution-buttons";

      const promptBtn = document.createElement("button");
      promptBtn.type = "button";
      promptBtn.className = "agent-resolution-btn";
      promptBtn.textContent = "Ask AI to repair plan";
      promptBtn.onclick = () => {
        requestInput.focus();
        requestInput.value = [
          String(requestInput.value || "").trim(),
          "",
          "Please repair the blueprint to resolve forge error:",
          `code=${String(failedEntry.code || "")}; error=${String(failedEntry.error || "")}`,
        ]
          .filter(Boolean)
          .join("\n");
        writeToConsole("Added repair prompt context to request box.", "log");
      };
      buttons.appendChild(promptBtn);

      if (String(failedEntry.code || "") === "TARGET_EXISTS" && String(failedOperation.op || "") === "create") {
        const overwriteBtn = document.createElement("button");
        overwriteBtn.type = "button";
        overwriteBtn.className = "agent-resolution-btn";
        overwriteBtn.textContent = "Overwrite and continue";
        overwriteBtn.onclick = async () => {
          const retryOperations = (Array.isArray(sentOperations) ? sentOperations : []).slice(firstFailureIndex).map(cloneOperation);
          if (retryOperations.length === 0) {
            return;
          }
          retryOperations[0] = {
            op: "edit",
            path: String(failedOperation.path || ""),
            content: String(failedOperation.content || ""),
          };
          await runResolutionRetry(retryOperations, "overwrite resolution");
        };
        buttons.appendChild(overwriteBtn);
      }

      resolutionEl.appendChild(buttons);
      resolutionEl.hidden = false;
    };

    const withBusyState = async (fn) => {
      consultBtn.disabled = true;
      blueprintBtn.disabled = true;
      approveBtn.disabled = true;
      forgeBtn.disabled = true;
      undoBtn.disabled = true;
      historyRefreshBtn.disabled = true;
      historyUndoBtn.disabled = true;
      try {
        await fn();
      } finally {
        consultBtn.disabled = false;
        blueprintBtn.disabled = false;
        approveBtn.disabled = !(
          agentWorkflowState.blueprint && Array.isArray(agentWorkflowState.blueprint.operations)
        );
        forgeBtn.disabled = !canForgeNow();
        undoBtn.disabled = !agentWorkflowState.lastUndoId;
        historyRefreshBtn.disabled = false;
        historyUndoBtn.disabled = !historySelect.value;
        refreshWorkflowStatus();
      }
    };

    consultBtn.addEventListener("click", async () => {
      const prompt = String(requestInput.value || "").trim();
      if (!prompt) {
        writeToConsole("Enter a request before running Consult.", "log");
        return;
      }

      await withBusyState(async () => {
        const context = getEditor?.()?.getValue?.().slice(-4000) || "";
        const result = await aiService.agentConsult(prompt, context);
        appendChatMessage("assistant", `Consult summary:\n${result.summary || "No summary."}`);
        if (Array.isArray(result.questions) && result.questions.length > 0) {
          appendChatMessage("assistant", `Consult questions:\n- ${result.questions.join("\n- ")}`);
        }
        if (Array.isArray(result.tradeoffs) && result.tradeoffs.length > 0) {
          appendChatMessage("assistant", `Tradeoffs:\n- ${result.tradeoffs.join("\n- ")}`);
        }
        setAiPanelOutput(JSON.stringify(result, null, 2));
      });
    });

    blueprintBtn.addEventListener("click", async () => {
      const prompt = String(requestInput.value || "").trim();
      if (!prompt) {
        writeToConsole("Enter a request before generating a Blueprint.", "log");
        return;
      }

      await withBusyState(async () => {
        const context = getEditor?.()?.getValue?.().slice(-4000) || "";
        const result = await aiService.agentBlueprint(prompt, context);
        agentWorkflowState.blueprint = result;
        agentWorkflowState.approved = false;
        agentWorkflowState.pendingForgeOperations = [];
        agentWorkflowState.pendingForgeSummary = "";
        clearResolutionActions();
        agentWorkflowState.selectedOperationIndices = Array.isArray(result.operations)
          ? result.operations.map((_, index) => index)
          : [];
        renderBlueprintPreview();
        appendChatMessage(
          "assistant",
          `Blueprint: ${result.title || "Untitled"}`,
          "",
          [],
          [],
          [],
          Array.isArray(result.steps) ? result.steps : [],
          []
        );
        writeToConsole(
          `Blueprint created with ${Array.isArray(result.operations) ? result.operations.length : 0} operations.`,
          "result"
        );
        setAiPanelOutput(JSON.stringify(result, null, 2));
      });
    });

    approveBtn.addEventListener("click", () => {
      const operations = getSelectedOperations();
      if (operations.length === 0) {
        writeToConsole("No selected operations to approve.", "log");
        return;
      }

      const selectedHighRiskCount = getSelectedHighRiskCount();
      if (selectedHighRiskCount > 0 && !forceHighRiskCheckbox.checked) {
        agentWorkflowState.approved = false;
        forgeBtn.disabled = true;
        refreshWorkflowStatus();
        writeToConsole(
          `Approval blocked: ${selectedHighRiskCount} high-risk operations selected. Enable Force high-risk to continue.`,
          "error"
        );
        return;
      }

      agentWorkflowState.approved = true;
      forgeBtn.disabled = !canForgeNow();
      refreshWorkflowStatus();
      writeToConsole(`Blueprint approved with ${operations.length} selected operations.`, "result");
    });

    forgeBtn.addEventListener("click", async () => {
      const operations = getSelectedOperations();
      if (operations.length === 0) {
        writeToConsole("No selected Blueprint operations to execute.", "log");
        return;
      }

      const selectedHighRiskCount = getSelectedHighRiskCount();
      if (selectedHighRiskCount > 0 && !forceHighRiskCheckbox.checked) {
        writeToConsole(
          `Forge blocked: ${selectedHighRiskCount} high-risk operations selected. Enable Force high-risk to continue.`,
          "error"
        );
        refreshWorkflowStatus();
        return;
      }

      await withBusyState(async () => {
        const summary = agentWorkflowState.blueprint?.title || "Forge execution";
        agentWorkflowState.pendingForgeSummary = summary;
        agentWorkflowState.pendingForgeOperations = operations.map(cloneOperation);
        const allowHighRisk = Boolean(forceHighRiskCheckbox.checked);
        const result = await aiService.agentForge(operations, summary, {
          allowHighRisk,
        });
        agentWorkflowState.lastUndoId = String(result.undoId || "");
        agentWorkflowState.approved = false;
        renderBlueprintPreview();
        if (agentWorkflowState.lastUndoId) {
          await loadUndoHistory();
        }
        appendChatMessage(
          "assistant",
          `Forge complete. Success: ${result.successCount || 0}, Failed: ${result.failureCount || 0}.`
        );
        if (result.blockedByRiskPolicy) {
          appendChatMessage("assistant", "Forge was blocked by server risk policy. Enable high-risk explicitly to proceed.");
        }
        if (result.requiresUserResolution) {
          appendChatMessage(
            "assistant",
            "Forge paused on error. Please provide how to resolve the failing step (overwrite target, rename path, or adjust operation), then run Blueprint/Forge again."
          );
          writeToConsole("Forge paused for user resolution before continuing.", "error");
          renderResolutionActions(result, operations.map(cloneOperation));
        } else {
          clearResolutionActions();
        }
        appendChatMessage("assistant", `Forge transcript:\n${renderOperationTranscript(result.results || [])}`);
        setAiPanelOutput(JSON.stringify(result, null, 2));
        await loadFileExplorer();
      });
    });

    undoBtn.addEventListener("click", async () => {
      if (!agentWorkflowState.lastUndoId) {
        writeToConsole("No undo entry available.", "log");
        return;
      }

      await withBusyState(async () => {
        const result = await aiService.agentUndo(agentWorkflowState.lastUndoId);
        if (result.success) {
          appendChatMessage("assistant", "Undo completed successfully.");
          agentWorkflowState.lastUndoId = "";
        } else {
          appendChatMessage("assistant", `Undo failed: ${result.error || "unknown error"}`);
        }
        appendChatMessage("assistant", `Undo transcript:\n${renderOperationTranscript(result.results || [])}`);
        await loadUndoHistory();
        setAiPanelOutput(JSON.stringify(result, null, 2));
        await loadFileExplorer();
      });
    });

    historySelect.addEventListener("change", () => {
      historyUndoBtn.disabled = !historySelect.value;
    });

    forceHighRiskCheckbox.addEventListener("change", () => {
      if (!forceHighRiskCheckbox.checked) {
        agentWorkflowState.approved = false;
      }
      forgeBtn.disabled = !canForgeNow();
      refreshWorkflowStatus();
      renderBlueprintPreview();
    });

    historyRefreshBtn.addEventListener("click", async () => {
      await withBusyState(async () => {
        await loadUndoHistory();
        writeToConsole(`Loaded ${agentWorkflowState.undoHistory.length} undo history entries.`, "log");
      });
    });

    historyUndoBtn.addEventListener("click", async () => {
      const undoId = String(historySelect.value || "").trim();
      if (!undoId) {
        writeToConsole("Select an undo entry first.", "log");
        return;
      }

      await withBusyState(async () => {
        const result = await aiService.agentUndo(undoId);
        if (result.success) {
          appendChatMessage("assistant", `Undo selected entry succeeded (${undoId}).`);
          if (agentWorkflowState.lastUndoId === undoId) {
            agentWorkflowState.lastUndoId = "";
          }
        } else {
          appendChatMessage("assistant", `Undo selected entry failed: ${result.error || "unknown error"}`);
        }
        appendChatMessage("assistant", `Undo transcript:\n${renderOperationTranscript(result.results || [])}`);
        await loadUndoHistory();
        setAiPanelOutput(JSON.stringify(result, null, 2));
        await loadFileExplorer();
      });
    });

    loadUndoHistory().catch(() => {});
    renderBlueprintPreview();
    refreshWorkflowStatus();
  }

  globalScope.workhorseChatModule = {
    initializeChatTransportSelector,
    sendChatMessage,
    bindChatInputHandlers,
    bindAgentWorkflowHandlers,
  };
})(window);