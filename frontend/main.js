const aiService = window.aiService;
const consoleRuntime = window.workhorseConsoleModule.initializeConsoleRuntime();
const {
  writeToConsole,
  clearConsole,
  setAiStatus,
  setAiPanelOutput,
  isNearBottom,
  scrollToBottom,
} = consoleRuntime;
const editorRuntime = window.workhorseEditorModule.initializeEditorRuntime();

// Initialize new UI runtimes
const contextRuntime = window.workhorseContextModule.initializeContextRuntime();
const composerRuntime = window.workhorseComposerModule.initializeComposerRuntime();
const drawerRuntime = window.workhorseDrawerModule.initializeDrawerRuntime();
const pickerRuntime = window.workhorseContextPickerModal.initializeContextPickerRuntime();

const appState = {
  executionRuntime: null,
  explorerRuntime: null,
  commandHistory: [],
  historyIndex: -1,
  chatHistory: [],
  currentWorkspaceFilePath: "",
};

function insertCodeIntoEditor(code) {
  if (!window.editor || !code) return;

  const selection = window.editor.getSelection();
  window.editor.executeEdits("ai-chat-insert", [
    {
      range: selection,
      text: code,
      forceMoveMarkers: true
    }
  ]);
  window.editor.focus();
}

async function copyCodeToClipboard(code) {
  if (!code) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(code);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    writeToConsole("✅ Code copied to clipboard", "result");
  } catch (err) {
    writeToConsole(`Copy failed: ${err.message}`, "error");
  }
}

/**
 * Render context chips to the chips container
 */
function renderContextChips() {
  const container = document.getElementById("context-chips-container");
  if (!container) return;

  container.innerHTML = "";

  const visibleChips = contextRuntime.getVisibleChips();
  visibleChips.forEach((chip) => {
    const chipEl = document.createElement("div");
    chipEl.className = "chip";

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = chip.label;

    const removeBtn = document.createElement("button");
    removeBtn.className = "chip-remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chipEl.classList.add("chip--removing");
      setTimeout(() => {
        contextRuntime.removeChip(chip.id);
        renderContextChips();
      }, 200);
    });

    chipEl.appendChild(label);
    chipEl.appendChild(removeBtn);
    container.appendChild(chipEl);
  });

  // Add "+N more" button if chips are hidden
  if (contextRuntime.hasHiddenChips()) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "context-add-btn";
    moreBtn.type = "button";
    moreBtn.textContent = `+ ${contextRuntime.getHiddenChipCount()} more`;
    moreBtn.addEventListener("click", () => {
      pickerRuntime.openContextPicker();
    });
    container.appendChild(moreBtn);
  }
}

/**
 * Build agent payload for backend
 */
function buildAgentPayload() {
  return {
    prompt: composerRuntime.getComposerText(),
    mode: composerRuntime.getSelectedMode(),
    context: contextRuntime.serializeChips(),
    allow_high_risk: document.getElementById("agent-force-high-risk")?.checked || false,
    claude_model: composerRuntime.getClaudeModel() || "auto",
  };
}

// Wire up context chip events
contextRuntime.on("onChipsChanged", () => {
  renderContextChips();
  composerRuntime.updateSendButtonState?.();
});

// Wire up context picker events
pickerRuntime.on("onContextPickerClosed", (selectedItems) => {
  if (!Array.isArray(selectedItems)) return;

  selectedItems.forEach((item) => {
    contextRuntime.addChip(item.type, {
      path: item.path,
      label: item.label,
      startLine: item.startLine,
      endLine: item.endLine,
    }, item.value || "");
  });

  renderContextChips();
});

// Wire up composer events
composerRuntime.on("onModeChanged", (newMode) => {
  writeToConsole(`Mode switched to: ${newMode}`, "log");
});

composerRuntime.on("onComposerSending", (payload) => {
  writeToConsole(`Sending ${payload.mode} request...`, "log");
});

// Wire up drawer events
drawerRuntime.on("onApproveRequested", (operations) => {
  writeToConsole(`Blueprint approved with ${operations.length} operations`, "log");
  composerRuntime.setSelectedMode("forge");
  composerRuntime.enableForgeMode(true);
});

drawerRuntime.on("onRejectRequested", () => {
  writeToConsole("Blueprint rejected", "log");
  contextRuntime.clearChips();
  composerRuntime.clearComposer();
});

// Initially render empty chips row
renderContextChips();

  aiService,
  isNearBottom,
  scrollToBottom,
  insertCodeIntoEditor,
  copyCodeToClipboard,
  setAiPanelOutput,
  loadFileExplorer: () => appState.explorerRuntime?.loadFileExplorer?.(),
});

function initializeKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
  if (document.activeElement && document.activeElement.id === "chat-input") {
    return;
  }

  if (e.key === "ArrowUp") {
    if (appState.historyIndex > 0) {
      appState.historyIndex--;
      window.editor.setValue(appState.commandHistory[appState.historyIndex]);
    }
    return;
  }

  if (e.key === "ArrowDown") {
    if (appState.historyIndex < appState.commandHistory.length - 1) {
      appState.historyIndex++;
      window.editor.setValue(appState.commandHistory[appState.historyIndex]);
    } else {
      appState.historyIndex = appState.commandHistory.length;
      window.editor.setValue("");
    }
    return;
  }

  if (e.ctrlKey && e.key === "Enter") {
    document.getElementById("run-btn").click();
  }
});
}

async function bootstrapApp() {
  setAiStatus("unknown", "Unknown");

  appState.executionRuntime = window.workhorseExecutionModule.initializeExecutionRuntime({
    aiService,
    clearConsole,
    writeToConsole,
    getCurrentWorkspaceFilePath: () => appState.currentWorkspaceFilePath,
    onCodeExecuted: (code) => {
      appState.commandHistory.push(code);
      appState.historyIndex = appState.commandHistory.length;
    },
    getEditor: () => editorRuntime.getEditor(),
    getLanguage: () => document.getElementById("language-select").value,
  });

  await window.workhorseChatModule.initializeChatTransportSelector({
    aiService,
    writeToConsole,
  });

  appState.explorerRuntime = window.workhorseExplorerModule.createExplorerRuntime({
    aiService,
    writeToConsole,
    setCurrentWorkspaceFilePath: (value) => {
      appState.currentWorkspaceFilePath = value || "";
    },
    isExecutablePath: (filePath) => appState.executionRuntime?.isExecutablePath(filePath),
    getEditor: () => editorRuntime.getEditor(),
    getLanguage: () => document.getElementById("language-select").value || "javascript",
    setLanguage: (value) => {
      document.getElementById("language-select").value = value;
    },
  });

  window.workhorsePanelResizerModule.initializePanelResizers(() => editorRuntime.getEditor());
  appState.explorerRuntime.loadFileExplorer();

  // Wire up Send button to composer + drawer
  const sendBtn = document.getElementById("composer-send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (composerRuntime.isSendDisabled()) {
        return;
      }

      const payload = buildAgentPayload();
      
      composerRuntime.disableComposer();
      drawerRuntime.clearDrawer();

      try {
        const mode = payload.mode || "consult";
        let response;

        if (mode === "consult") {
          response = await aiService.agentConsult(payload);
          drawerRuntime.showConsultResults(response.questions, response.summary);
        } else if (mode === "blueprint") {
          response = await aiService.agentBlueprint(payload);
          drawerRuntime.showBlueprintPreview(response.operations, response.title || response.summary);
        } else if (mode === "forge") {
          const operations = drawerRuntime.getSelectedOperations();
          response = await aiService.agentForge({
            ...payload,
            operations: operations.map((op) => ({
              op: op.op,
              path: op.path,
              newPath: op.newPath,
              content: op.content,
            })),
          });
          drawerRuntime.showUndoHistory([
            {
              undoId: response.undoId,
              summary: `Forge: ${response.successCount} operations`,
              createdAt: Date.now(),
            },
          ]);
          writeToConsole(`✅ Forge completed: ${response.successCount} operations executed`, "result");
        }

        // Add to console for visibility
        writeToConsole(`${mode.toUpperCase()}: ${payload.prompt}`, "log");
      } catch (err) {
        writeToConsole(`Error: ${err.message}`, "error");
      } finally {
        composerRuntime.enableComposer();
      }
    });
  }

  window.workhorseAiFeaturesModule.initializeAiFeatureHandlers({
    aiService,
    clearConsole,
    writeToConsole,
    setAiPanelOutput,
    setAiStatus,
  });

  window.workhorseChatModule.bindChatInputHandlers({
    aiService,
    chatHistory: appState.chatHistory,
    getSelectedChatModel: () => "",
    appendChatMessage,
    isNearBottom,
    scrollToBottom,
    insertCodeIntoEditor,
    writeToConsole,
    setAiPanelOutput,
    loadFileExplorer: () => appState.explorerRuntime?.loadFileExplorer?.(),
  });

  window.workhorseChatModule.bindAgentWorkflowHandlers({
    aiService,
    appendChatMessage,
    writeToConsole,
    setAiPanelOutput,
    loadFileExplorer: () => appState.explorerRuntime?.loadFileExplorer?.(),
    getEditor: () => editorRuntime.getEditor(),
  });

  // Wire up claude model select to composerModule
  const claudeModelSelect = document.getElementById("agent-claude-model-select");
  if (claudeModelSelect) {
    claudeModelSelect.addEventListener("change", (e) => {
      composerRuntime.setClaudeModel(e.target.value || "auto");
    });
  }

  initializeKeyboardShortcuts();
}

bootstrapApp();