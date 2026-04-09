(function initWorkhoseComposerModule(globalScope) {
  const composerState = {
    text: "",
    selectedMode: "consult",
    disabled: false,
    pendingOperation: null,
    claudeModel: "auto",
  };

  const observables = {
    onModeChanged: [],
    onComposerSending: [],
    onComposerCleared: [],
    onTextChanged: [],
  };

  let composerInput = null;
  let sendBtn = null;

  /**
   * Subscribe to composer events
   */
  function subscribe(event, callback) {
    if (observables[event]) {
      observables[event].push(callback);
    }
  }

  /**
   * Publish event to subscribers
   */
  function publish(event, data) {
    if (observables[event]) {
      observables[event].forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in composer ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Get current composer text
   */
  function getComposerText() {
    return composerState.text;
  }

  /**
   * Set composer text
   */
  function setComposerText(text) {
    if (!composerInput) return;

    composerState.text = text || "";
    composerInput.value = composerState.text;
    autoGrowTextarea();
    updateSendButtonState();
    publish("onTextChanged", composerState.text);
  }

  /**
   * Clear composer text
   */
  function clearComposer() {
    setComposerText("");
    publish("onComposerCleared");
  }

  /**
   * Focus composer input
   */
  function focusComposer() {
    if (composerInput) {
      composerInput.focus();
    }
  }

  /**
   * Disable composer during send
   */
  function disableComposer() {
    if (!composerInput) return;
    composerState.disabled = true;
    composerInput.disabled = true;
    updateSendButtonState();
  }

  /**
   * Enable composer after response
   */
  function enableComposer() {
    if (!composerInput) return;
    composerState.disabled = false;
    composerInput.disabled = false;
    updateSendButtonState();
    focusComposer();
  }

  /**
   * Get selected mode
   */
  function getSelectedMode() {
    return composerState.selectedMode;
  }

  /**
   * Set selected mode (toggle)
   */
  function setSelectedMode(mode) {
    const validModes = ["consult", "blueprint", "forge"];
    if (!validModes.includes(mode)) {
      console.warn("Invalid mode:", mode);
      return;
    }

    // If clicking same mode, don't change
    if (composerState.selectedMode === mode) {
      return;
    }

    composerState.selectedMode = mode;
    updateModeButtons();
    updateSendButtonState();
    publish("onModeChanged", mode);
  }

  /**
   * Set Claude model
   */
  function setClaudeModel(model) {
    composerState.claudeModel = model || "auto";
  }

  /**
   * Get Claude model
   */
  function getClaudeModel() {
    return composerState.claudeModel;
  }

  /**
   * Check if Send button should be disabled
   */
  function isSendDisabled() {
    if (composerState.disabled) return true;
    if (!composerState.text || composerState.text.trim().length === 0) return true;
    return false;
  }

  /**
   * Update Send button state
   */
  function updateSendButtonState() {
    if (!sendBtn) return;

    if (isSendDisabled()) {
      sendBtn.disabled = true;
    } else {
      sendBtn.disabled = false;
    }
  }

  /**
   * Auto-grow textarea as user types
   */
  function autoGrowTextarea() {
    if (!composerInput) return;

    // Reset height to calculate scroll height
    composerInput.style.height = "auto";

    // Calculate new height (min 40px, max 120px)
    const newHeight = Math.min(Math.max(composerInput.scrollHeight, 40), 120);
    composerInput.style.height = newHeight + "px";
  }

  /**
   * Handle text input (track changes)
   */
  function handleInput(event) {
    composerState.text = event.target.value || "";
    autoGrowTextarea();
    updateSendButtonState();
    publish("onTextChanged", composerState.text);
  }

  /**
   * Handle key down (Enter, Shift+Enter, Escape, Ctrl+K)
   */
  function handleKeyDown(event) {
    // Ctrl+K: Open context picker
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      const pickerModal = document.getElementById("context-picker-modal");
      if (pickerModal) {
        pickerModal.removeAttribute("hidden");
      }
      return;
    }

    // Escape: Clear (with confirmation if unsaved)
    if (event.key === "Escape") {
      event.preventDefault();
      if (composerState.text && composerState.text.trim().length > 5) {
        if (confirm("Clear composer text? This action cannot be undone.")) {
          clearComposer();
        }
      } else {
        clearComposer();
      }
      return;
    }

    // Enter (no Shift): Send
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSendDisabled() && sendBtn) {
        publish("onComposerSending", {
          prompt: composerState.text,
          mode: composerState.selectedMode,
          claudeModel: composerState.claudeModel,
        });
        sendBtn.click();
      }
      return;
    }

    // Shift+Enter: Newline (default behavior, no prevention)
  }

  /**
   * Update visual state of mode buttons
   */
  function updateModeButtons() {
    const modes = ["consult", "blueprint", "forge"];
    modes.forEach((mode) => {
      const btn = document.getElementById(`mode-${mode}-btn`);
      if (btn) {
        if (mode === composerState.selectedMode) {
          btn.classList.add("mode-button--active");
        } else {
          btn.classList.remove("mode-button--active");
        }
      }
    });
  }

  /**
   * Set forge mode availability
   */
  function enableForgeMode(enabled = true) {
    const forgeBtn = document.getElementById("mode-forge-btn");
    if (forgeBtn) {
      forgeBtn.disabled = !enabled;
    }
  }

  /**
   * Initialize the module runtime
   */
  function initializeComposerRuntime() {
    composerInput = document.getElementById("composer-input");
    sendBtn = document.getElementById("composer-send-btn");

    if (!composerInput || !sendBtn) {
      console.error("Composer elements not found in DOM");
      return null;
    }

    // Wire up event listeners
    composerInput.addEventListener("input", handleInput);
    composerInput.addEventListener("keydown", handleKeyDown);

    // Mode button listeners
    ["consult", "blueprint", "forge"].forEach((mode) => {
      const btn = document.getElementById(`mode-${mode}-btn`);
      if (btn) {
        btn.addEventListener("click", () => {
          setSelectedMode(mode);
        });
      }
    });

    // Initialize UI state
    updateModeButtons();
    updateSendButtonState();

    return {
      getComposerText,
      setComposerText,
      clearComposer,
      focusComposer,
      disableComposer,
      enableComposer,
      getSelectedMode,
      setSelectedMode,
      setClaudeModel,
      getClaudeModel,
      isSendDisabled,
      enableForgeMode,
      subscribe,
      on: subscribe, // Alias
    };
  }

  globalScope.workhorseComposerModule = {
    initializeComposerRuntime,
  };
})(window);
