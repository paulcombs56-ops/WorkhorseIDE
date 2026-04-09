(function initWorkhoseDrawerModule(globalScope) {
  const drawerState = {
    collapsed: false,
    consultResults: null,
    blueprintOperations: [],
    selectedOperationIndices: new Set(),
    undoHistory: [],
    activeTab: "blueprint",
  };

  const observables = {
    onOperationToggled: [],
    onUndoSelected: [],
    onDrawerCollapseToggled: [],
    onApproveRequested: [],
    onRejectRequested: [],
  };

  let drawer = null;
  let drawerToggle = null;
  let operationsListContainer = null;
  let undoHistoryContainer = null;
  let approveBtn = null;
  let rejectBtn = null;

  /**
   * Subscribe to drawer events
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
          console.error(`Error in drawer ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Show Consult results
   */
  function showConsultResults(questions, summary) {
    drawerState.consultResults = { questions, summary };

    const section = document.getElementById("drawer-consult-section");
    if (!section) return;

    const resultsDiv = document.getElementById("consult-results");
    if (!resultsDiv) return;

    let html = "";
    if (summary) {
      html += `<div style="margin-bottom: 8px; font-size: 12px; color: #ffcf9f;"><strong>Summary:</strong><br/>${escapeHtml(summary)}</div>`;
    }

    if (Array.isArray(questions) && questions.length > 0) {
      html += "<div style='font-size: 12px;'><strong>Questions:</strong><ul style='margin: 4px 0; padding-left: 20px;'>";
      questions.forEach((q) => {
        html += `<li style="margin-bottom: 4px;">${escapeHtml(q)}</li>`;
      });
      html += "</ul></div>";
    }

    resultsDiv.innerHTML = html || "No consult results yet.";

    section.removeAttribute("hidden");
    section.classList.remove("drawer-section--collapsed");
    openDrawer();
  }

  /**
   * Show Blueprint preview with operations
   */
  function showBlueprintPreview(operations, summary) {
    drawerState.blueprintOperations = operations || [];
    drawerState.selectedOperationIndices.clear();

    // Set all operations as selected by default
    for (let i = 0; i < drawerState.blueprintOperations.length; i++) {
      drawerState.selectedOperationIndices.add(i);
    }

    const section = document.getElementById("drawer-blueprint-section");
    if (!section) return;

    const previewDiv = document.getElementById("blueprint-preview");
    if (!previewDiv) return;

    // Show summary
    if (summary) {
      previewDiv.innerHTML = `<div style="margin-bottom: 8px; padding: 6px; background: #1a3f72; border-radius: 4px; color: #ffcf9f; font-size: 12px;"><strong>Plan:</strong><br/>${escapeHtml(summary)}</div>`;
    }

    renderOperationsList();
    section.classList.remove("drawer-section--collapsed");
    openDrawer();

    // Enable approve button
    if (approveBtn) {
      approveBtn.disabled = false;
    }
  }

  /**
   * Render operations list
   */
  function renderOperationsList() {
    if (!operationsListContainer) return;

    operationsListContainer.innerHTML = "";

    if (drawerState.blueprintOperations.length === 0) {
      operationsListContainer.innerHTML = "<div style='font-size: 12px; color: #a89a88;'>No operations to display.</div>";
      return;
    }

    const list = document.createElement("div");
    list.id = "operations-list";

    drawerState.blueprintOperations.forEach((op, index) => {
      const row = document.createElement("div");
      row.className = "operation-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "operation-checkbox";
      checkbox.checked = drawerState.selectedOperationIndices.has(index);
      checkbox.addEventListener("change", () => handleOperationToggle(index, checkbox.checked));

      const icon = document.createElement("span");
      icon.className = "operation-icon";
      icon.textContent = getOpIcon(op.op);

      const path = document.createElement("span");
      path.className = "operation-path";
      path.textContent = op.path || "(unknown)";

      const risk = document.createElement("span");
      risk.className = `operation-risk ${op.risk || "low"}`;
      risk.textContent = (op.risk || "low").charAt(0).toUpperCase() + (op.risk || "low").slice(1);

      row.appendChild(checkbox);
      row.appendChild(icon);
      row.appendChild(path);
      row.appendChild(risk);

      list.appendChild(row);
    });

    operationsListContainer.innerHTML = "";
    operationsListContainer.appendChild(list);
  }

  /**
   * Get operation icon
   */
  function getOpIcon(op) {
    switch (op) {
      case "create":
        return "➕";
      case "edit":
        return "✏️";
      case "delete":
        return "🗑️";
      case "rename":
        return "🔄";
      default:
        return "📄";
    }
  }

  /**
   * Handle operation checkbox toggle
   */
  function handleOperationToggle(index, checked) {
    if (checked) {
      drawerState.selectedOperationIndices.add(index);
    } else {
      drawerState.selectedOperationIndices.delete(index);
    }

    publish("onOperationToggled", { index, checked });
  }

  /**
   * Get selected operations
   */
  function getSelectedOperations() {
    return drawerState.blueprintOperations.filter((_, index) => drawerState.selectedOperationIndices.has(index));
  }

  /**
   * Show Undo history
   */
  function showUndoHistory(historyEntries) {
    drawerState.undoHistory = historyEntries || [];

    const section = document.getElementById("drawer-undo-section");
    if (!section) return;

    if (!undoHistoryContainer) return;

    undoHistoryContainer.innerHTML = "";

    if (drawerState.undoHistory.length === 0) {
      undoHistoryContainer.innerHTML = "<div style='font-size: 12px; color: #a89a88;'>No undo history yet.</div>";
      section.classList.add("drawer-section--collapsed");
      return;
    }

    const list = document.createElement("div");
    list.id = "undo-history-list";

    drawerState.undoHistory.forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = "undo-history-item";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "undo-select";
      radio.value = entry.undoId || index;
      radio.addEventListener("change", () => handleUndoSelect(entry.undoId || index));

      const summary = document.createElement("span");
      summary.className = "undo-history-summary";
      summary.textContent = entry.summary || `Undo #${index + 1}`;

      const time = document.createElement("span");
      time.className = "undo-history-time";
      const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : "Unknown";
      time.textContent = ` (${timestamp})`;

      item.appendChild(radio);
      item.appendChild(summary);
      item.appendChild(time);

      list.appendChild(item);
    });

    undoHistoryContainer.innerHTML = "";
    undoHistoryContainer.appendChild(list);

    section.classList.remove("drawer-section--collapsed");
  }

  /**
   * Handle undo selection
   */
  function handleUndoSelect(undoId) {
    publish("onUndoSelected", undoId);
  }

  /**
   * Toggle drawer collapse
   */
  function toggleDrawerCollapse() {
    drawerState.collapsed = !drawerState.collapsed;

    if (!drawer) return;

    if (drawerState.collapsed) {
      drawer.classList.add("drawer--collapsed");
      if (drawerToggle) {
        drawerToggle.textContent = "▶";
      }
    } else {
      drawer.classList.remove("drawer--collapsed");
      if (drawerToggle) {
        drawerToggle.textContent = "▼";
      }
    }

    publish("onDrawerCollapseToggled", drawerState.collapsed);
  }

  /**
   * Open drawer (uncollapse if collapsed)
   */
  function openDrawer() {
    if (drawerState.collapsed) {
      drawerState.collapsed = false;
      if (drawer) {
        drawer.classList.remove("drawer--collapsed");
      }
      if (drawerToggle) {
        drawerToggle.textContent = "▼";
      }
    }
  }

  /**
   * Clear drawer
   */
  function clearDrawer() {
    const consultResults = document.getElementById("consult-results");
    if (consultResults) {
      consultResults.innerHTML = "";
    }

    if (operationsListContainer) {
      operationsListContainer.innerHTML = "";
    }

    if (undoHistoryContainer) {
      undoHistoryContainer.innerHTML = "";
    }

    drawerState.consultResults = null;
    drawerState.blueprintOperations = [];
    drawerState.selectedOperationIndices.clear();

    if (approveBtn) {
      approveBtn.disabled = true;
    }
  }

  /**
   * Get drawer state
   */
  function getDrawerState() {
    return {
      collapsed: drawerState.collapsed,
      operations: getSelectedOperations(),
      operationCount: drawerState.blueprintOperations.length,
      selectedCount: drawerState.selectedOperationIndices.size,
      undoHistoryCount: drawerState.undoHistory.length,
    };
  }

  /**
   * Escape HTML entities
   */
  function escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Initialize the module runtime
   */
  function initializeDrawerRuntime() {
    drawer = document.getElementById("blueprint-drawer");
    drawerToggle = document.getElementById("blueprint-drawer-toggle");
    operationsListContainer = document.getElementById("operations-list") || document.createElement("div");
    operationsListContainer.id = "operations-list";
    undoHistoryContainer = document.getElementById("undo-history-list") || document.createElement("div");
    undoHistoryContainer.id = "undo-history-list";
    approveBtn = document.getElementById("blueprint-approve-btn");
    rejectBtn = document.getElementById("blueprint-reject-btn");

    if (!drawer) {
      console.error("Blueprint drawer not found in DOM");
      return null;
    }

    // Wire up drawer toggle button
    if (drawerToggle) {
      drawerToggle.addEventListener("click", toggleDrawerCollapse);
    }

    // Wire up approve/reject buttons
    if (approveBtn) {
      approveBtn.addEventListener("click", () => {
        publish("onApproveRequested", getSelectedOperations());
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener("click", () => {
        clearDrawer();
        publish("onRejectRequested");
      });
    }

    // Wire up section headers to toggle collapse
    document.querySelectorAll(".drawer-section-header").forEach((header) => {
      header.addEventListener("click", () => {
        const section = header.closest(".drawer-section");
        if (section) {
          section.classList.toggle("drawer-section--collapsed");
        }
      });
    });

    return {
      showConsultResults,
      showBlueprintPreview,
      showUndoHistory,
      getSelectedOperations,
      clearDrawer,
      toggleDrawerCollapse,
      openDrawer,
      getDrawerState,
      subscribe,
      on: subscribe, // Alias
    };
  }

  globalScope.workhorseDrawerModule = {
    initializeDrawerRuntime,
  };
})(window);
