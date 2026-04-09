(function initWorkhoseContextPickerModal(globalScope) {
  const pickerState = {
    selectedItems: new Set(),
    recentFiles: [],
    workspaceFiles: [],
  };

  const observables = {
    onContextPickerClosed: [],
  };

  let modal = null;
  let searchInput = null;
  let addBtn = null;

  /**
   * Subscribe to picker events
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
          console.error(`Error in context picker ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Open context picker modal
   */
  function openContextPicker() {
    if (!modal) return;

    modal.removeAttribute("hidden");
    populateRecentFiles();
    populateWorkspaceFiles();

    if (searchInput) {
      searchInput.focus();
    }
  }

  /**
   * Close context picker modal
   */
  function closeContextPicker(doPublish = false) {
    if (!modal) return;

    // Collect selected items
    const selected = [];
    document.querySelectorAll("#context-picker-modal input[type='checkbox']:checked").forEach((checkbox) => {
      const item = JSON.parse(checkbox.dataset.item || "{}");
      if (item.type && item.label) {
        selected.push(item);
      }
    });

    modal.setAttribute("hidden", "");
    pickerState.selectedItems.clear();

    if (doPublish && selected.length > 0) {
      publish("onContextPickerClosed", selected);
    }
  }

  /**
   * Populate recent files
   */
  function populateRecentFiles() {
    const container = document.getElementById("context-picker-recent");
    if (!container) return;

    container.innerHTML = "";

    // Try to get from editorRuntime if available
    const recentFiles = globalScope.appState?.chatHistory?.slice(0, 5) || [];

    if (recentFiles.length === 0) {
      if (globalScope.editor && globalScope.editorRuntime) {
        const model = globalScope.editor.getModel();
        if (model) {
          const fileName = model.uri.path.split("/").pop() || "file";
          recentFiles.push({
            type: "file",
            path: model.uri.path,
            label: `📄 ${fileName}`,
            value: model.getValue(),
          });
        }
      }
    }

    recentFiles.forEach((file, idx) => {
      const checkbox = createPickerItem(file);
      if (checkbox) {
        container.appendChild(checkbox);
      }
    });

    if (recentFiles.length === 0) {
      container.innerHTML = "<div style='font-size: 11px; color: #a89a88; padding: 6px;'>No recent files</div>";
    }
  }

  /**
   * Populate workspace files (from explorer if available)
   */
  function populateWorkspaceFiles() {
    const container = document.getElementById("context-picker-workspace");
    if (!container) return;

    container.innerHTML = "";

    // For now, this is a placeholder. In a real implementation,
    // this would call the backend search endpoint or use explorer tree
    let files = [];

    // Check if explorer has file list
    if (globalScope.explorerRuntime && globalScope.explorerRuntime.getFileList) {
      files = globalScope.explorerRuntime.getFileList() || [];
    }

    files.slice(0, 10).forEach((filePath) => {
      const fileName = filePath.split("/").pop() || filePath;
      const item = {
        type: "file",
        path: filePath,
        label: `📄 ${fileName}`,
        value: "", // Will be fetched on demand
      };

      const checkbox = createPickerItem(item);
      if (checkbox) {
        container.appendChild(checkbox);
      }
    });

    if (files.length === 0) {
      container.innerHTML = "<div style='font-size: 11px; color: #a89a88; padding: 6px;'>No workspace files available</div>";
    }
  }

  /**
   * Create a picker item (checkbox + label)
   */
  function createPickerItem(item) {
    if (!item || !item.type) return null;

    const label = document.createElement("label");
    label.className = "context-picker-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.item = JSON.stringify(item);
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        pickerState.selectedItems.add(item);
      } else {
        pickerState.selectedItems.delete(item);
      }
      updateAddButtonState();
    });

    const text = document.createElement("span");
    text.textContent = item.label || item.type;

    label.appendChild(checkbox);
    label.appendChild(text);

    return label;
  }

  /**
   * Handle search/filter
   */
  function handleSearch(query) {
    if (!query || query.trim().length === 0) {
      // Reset to show all
      populateRecentFiles();
      populateWorkspaceFiles();
      return;
    }

    const lower = query.toLowerCase();

    // Filter recent files
    const recentContainer = document.getElementById("context-picker-recent");
    if (recentContainer) {
      document.querySelectorAll("#context-picker-recent .context-picker-item").forEach((item) => {
        const label = item.textContent.toLowerCase();
        item.style.display = label.includes(lower) ? "flex" : "none";
      });
    }

    // Filter workspace files
    const workspaceContainer = document.getElementById("context-picker-workspace");
    if (workspaceContainer) {
      document.querySelectorAll("#context-picker-workspace .context-picker-item").forEach((item) => {
        const label = item.textContent.toLowerCase();
        item.style.display = label.includes(lower) ? "flex" : "none";
      });
    }
  }

  /**
   * Update Add button state
   */
  function updateAddButtonState() {
    if (!addBtn) return;

    if (pickerState.selectedItems.size > 0) {
      addBtn.disabled = false;
    } else {
      addBtn.disabled = true;
    }
  }

  /**
   * Initialize the module runtime
   */
  function initializeContextPickerRuntime() {
    modal = document.getElementById("context-picker-modal");
    searchInput = document.getElementById("context-picker-search");
    addBtn = document.getElementById("context-picker-add-btn");

    if (!modal) {
      console.error("Context picker modal not found in DOM");
      return null;
    }

    const cancelBtn = document.getElementById("context-picker-cancel-btn");
    const closeBtn = document.getElementById("context-picker-close-btn");
    const contextAddBtn = document.getElementById("context-add-btn");

    // Wire up search
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        handleSearch(e.target.value);
      });
    }

    // Wire up buttons
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const selected = Array.from(pickerState.selectedItems);
        closeContextPicker(true);
        // Clear selection after close
        pickerState.selectedItems.clear();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        pickerState.selectedItems.clear();
        closeContextPicker(false);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        pickerState.selectedItems.clear();
        closeContextPicker(false);
      });
    }

    // Wire up "Add Context" button from main UI
    if (contextAddBtn) {
      contextAddBtn.addEventListener("click", openContextPicker);
    }

    return {
      openContextPicker,
      closeContextPicker,
      subscribe,
      on: subscribe, // Alias
    };
  }

  globalScope.workhorseContextPickerModal = {
    initializeContextPickerRuntime,
  };
})(window);
