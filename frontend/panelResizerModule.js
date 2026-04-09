(function initWorkhorsePanelResizerModule(globalScope) {
  function initializePanelResizers(getEditor) {
    const explorer = document.getElementById("file-explorer-panel");
    const leftResizer = document.getElementById("left-panel-resizer");
    const consoleContainer = document.getElementById("console-container");
    const consoleResizer = document.getElementById("console-resizer");

    let dragState = null;

    const stopDragging = () => {
      dragState = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      getEditor()?.layout?.();
    };

    const onMouseMove = (event) => {
      if (!dragState) return;

      if (dragState.type === "left") {
        const width = Math.max(170, Math.min(520, event.clientX - dragState.layoutLeft));
        explorer.style.width = `${width}px`;
      } else if (dragState.type === "console") {
        const top = dragState.workspaceTop;
        const workspaceHeight = dragState.workspaceHeight;
        const newHeight = Math.max(120, Math.min(Math.floor(workspaceHeight * 0.6), workspaceHeight - (event.clientY - top)));
        consoleContainer.style.height = `${newHeight}px`;
      }

      getEditor()?.layout?.();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDragging);

    if (leftResizer) {
      leftResizer.addEventListener("mousedown", () => {
        const layoutRect = document.getElementById("workspace-layout").getBoundingClientRect();
        dragState = { type: "left", layoutLeft: layoutRect.left };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
    }

    if (consoleResizer) {
      consoleResizer.addEventListener("mousedown", () => {
        const workspaceRect = document.getElementById("workspace-layout").getBoundingClientRect();
        dragState = {
          type: "console",
          workspaceTop: workspaceRect.top,
          workspaceHeight: workspaceRect.height,
        };
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
      });
    }
  }

  globalScope.workhorsePanelResizerModule = {
    initializePanelResizers,
  };
})(window);