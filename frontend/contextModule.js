(function initWorkhoseContextModule(globalScope) {
  const contextChips = [];
  const maxChipsVisible = 4;
  const observables = {
    onChipAdded: [],
    onChipRemoved: [],
    onChipsChanged: [],
  };

  let config = {
    maxTotalBytes: 500000,
    maxFiles: 10,
  };

  /**
   * Validate a single chip
   */
  function validateChip(chip) {
    if (!chip || typeof chip !== "object") {
      throw new Error("Chip must be an object");
    }

    const { type, path, value, label } = chip;

    if (!type || !["file", "selection", "terminal", "search", "tab"].includes(type)) {
      throw new Error("Chip type must be one of: file, selection, terminal, search, tab");
    }

    if (!label || typeof label !== "string") {
      throw new Error("Chip must have a label");
    }

    if (path && (path.includes("..") || path.startsWith("/"))) {
      throw new Error("Chip path cannot contain .. or start with /");
    }

    if (value && typeof value !== "string") {
      throw new Error("Chip value must be a string");
    }

    // Check total size limit
    const totalSize = contextChips.reduce((sum, c) => sum + (c.value?.length || 0), 0) + (value?.length || 0);
    if (totalSize > config.maxTotalBytes) {
      throw new Error(`Context exceeds max bytes (${config.maxTotalBytes})`);
    }

    // Check file count limit
    const fileCount = contextChips.filter((c) => c.type === "file").length + (type === "file" ? 1 : 0);
    if (fileCount > config.maxFiles) {
      throw new Error(`Context exceeds max files (${config.maxFiles})`);
    }

    return true;
  }

  /**
   * Subscribe to chip events
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
          console.error(`Error in ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Add a context chip
   */
  function addChip(type, metadata, value) {
    const chip = {
      id: `context-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      label: metadata?.label || `${type} chip`,
      value: value || "",
      metadata: metadata || {},
      timestamp: Date.now(),
    };

    validateChip(chip);

    // Check for duplicates (same path/content)
    const isDuplicate = contextChips.some((c) => c.metadata?.path === metadata?.path && c.type === type);
    if (isDuplicate) {
      console.warn("Chip already exists:", metadata?.path);
      return chip.id;
    }

    contextChips.push(chip);
    publish("onChipAdded", chip);
    publish("onChipsChanged", contextChips);

    return chip.id;
  }

  /**
   * Remove a chip by ID
   */
  function removeChip(chipId) {
    const index = contextChips.findIndex((c) => c.id === chipId);
    if (index === -1) {
      console.warn("Chip not found:", chipId);
      return false;
    }

    const removedChip = contextChips.splice(index, 1)[0];
    publish("onChipRemoved", removedChip);
    publish("onChipsChanged", contextChips);

    return true;
  }

  /**
   * Get all current chips
   */
  function getChips() {
    return [...contextChips];
  }

  /**
   * Clear all chips
   */
  function clearChips() {
    contextChips.length = 0;
    publish("onChipsChanged", contextChips);
  }

  /**
   * Get visible chips (up to maxChipsVisible)
   */
  function getVisibleChips() {
    return contextChips.slice(0, maxChipsVisible);
  }

  /**
   * Check if there are hidden chips
   */
  function hasHiddenChips() {
    return contextChips.length > maxChipsVisible;
  }

  /**
   * Get count of hidden chips
   */
  function getHiddenChipCount() {
    return Math.max(0, contextChips.length - maxChipsVisible);
  }

  /**
   * Update chip metadata
   */
  function updateChip(chipId, newMetadata) {
    const chip = contextChips.find((c) => c.id === chipId);
    if (!chip) {
      console.warn("Chip not found:", chipId);
      return false;
    }

    chip.metadata = { ...chip.metadata, ...newMetadata };
    chip.label = newMetadata.label || chip.label;
    publish("onChipsChanged", contextChips);

    return true;
  }

  /**
   * Serialize chips to string (for backend payload)
   */
  function serializeChips() {
    return contextChips.map((chip) => ({
      type: chip.type,
      path: chip.metadata?.path,
      content: chip.value,
      startLine: chip.metadata?.startLine,
      endLine: chip.metadata?.endLine,
      label: chip.label,
    }));
  }

  /**
   * Deserialize chips from array (restore from history)
   */
  function deserializeChips(chipArray) {
    contextChips.length = 0;
    if (!Array.isArray(chipArray)) {
      return;
    }

    for (const chipData of chipArray) {
      try {
        addChip(chipData.type, {
          path: chipData.path,
          label: chipData.label,
          startLine: chipData.startLine,
          endLine: chipData.endLine,
        }, chipData.content);
      } catch (err) {
        console.warn("Failed to restore chip:", err);
      }
    }
  }

  /**
   * Auto-detect current file from editor
   */
  function autoDetectCurrentFile() {
    if (!window.editor || !window.editorRuntime) {
      return null;
    }

    try {
      const model = window.editor.getModel();
      if (!model) return null;

      const uri = model.uri.path;
      const fileName = uri.split("/").pop() || "file";

      // Check if already in chips
      const exists = contextChips.some((c) => c.metadata?.path === uri && c.type === "file");
      if (exists) {
        return null;
      }

      const content = model.getValue();
      return {
        type: "file",
        metadata: { path: uri, label: `📄 ${fileName}` },
        value: content,
      };
    } catch (err) {
      console.warn("Failed to auto-detect file:", err);
      return null;
    }
  }

  /**
   * Auto-detect current selection from editor
   */
  function autoDetectSelection() {
    if (!window.editor || !window.editorRuntime) {
      return null;
    }

    try {
      const selection = window.editor.getSelection();
      if (!selection) return null;

      const model = window.editor.getModel();
      if (!model) return null;

      const selectedText = model.getValueInRange(selection);
      if (!selectedText || selectedText.trim().length === 0) {
        return null;
      }

      // Check if already in chips
      const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
      const exists = contextChips.some((c) => c.type === "selection" && c.metadata?.startLine === selection.startLineNumber);
      if (exists) {
        return null;
      }

      const uri = model.uri.path;
      return {
        type: "selection",
        metadata: {
          path: uri,
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
          label: `⚡ Selection: ${lineCount} lines`,
        },
        value: selectedText,
      };
    } catch (err) {
      console.warn("Failed to auto-detect selection:", err);
      return null;
    }
  }

  /**
   * Set config limits
   */
  function setConfig(newConfig) {
    config = { ...config, ...newConfig };
  }

  /**
   * Initialize the module runtime
   */
  function initializeContextRuntime() {
    return {
      addChip,
      removeChip,
      getChips,
      getVisibleChips,
      hasHiddenChips,
      getHiddenChipCount,
      clearChips,
      updateChip,
      serializeChips,
      deserializeChips,
      autoDetectCurrentFile,
      autoDetectSelection,
      setConfig,
      subscribe,
      on: subscribe, // Alias
    };
  }

  globalScope.workhorseContextModule = {
    initializeContextRuntime,
  };
})(window);
