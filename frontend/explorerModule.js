(function initWorkhorseExplorerModule(globalScope) {
  function detectLanguageFromPath(filePath = "", fallbackLanguage = "javascript") {
    const lower = String(filePath || "").toLowerCase();
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".ts") || lower.endsWith(".tsx")) {
      return "javascript";
    }
    return fallbackLanguage;
  }

  function createExplorerRuntime(runtime) {
    const {
      aiService,
      writeToConsole,
      setCurrentWorkspaceFilePath,
      isExecutablePath,
      getEditor,
      getLanguage,
      setLanguage,
    } = runtime;

    async function openFileInEditor(relativePath) {
      setCurrentWorkspaceFilePath(relativePath || "");

      if (isExecutablePath(relativePath)) {
        writeToConsole(`Selected executable: ${relativePath}. Click Run to launch it.`, "log");
        return;
      }

      const result = await aiService.getWorkspaceFile(relativePath);
      if (result.error) {
        writeToConsole(`File open failed: ${result.error}`, "error");
        return;
      }

      const editor = getEditor();
      if (!editor || !editor.getModel()) {
        writeToConsole("Editor is not ready yet.", "error");
        return;
      }

      const language = detectLanguageFromPath(relativePath, getLanguage());
      editor.setValue(result.content || "");
      monaco.editor.setModelLanguage(editor.getModel(), language);
      setLanguage(language);
      writeToConsole(`Opened ${relativePath}`, "result");
    }

    function renderExplorerNodes(nodes, container, depth = 0) {
      (nodes || []).forEach((node) => {
        if (node.type === "directory") {
          const folder = document.createElement("details");
          folder.classList.add("explorer-group");
          folder.open = depth < 1;

          const summary = document.createElement("summary");
          summary.classList.add("explorer-folder");
          summary.textContent = node.name;
          folder.appendChild(summary);

          const children = document.createElement("div");
          renderExplorerNodes(node.children || [], children, depth + 1);
          folder.appendChild(children);
          container.appendChild(folder);
          return;
        }

        const fileBtn = document.createElement("button");
        fileBtn.classList.add("explorer-item");
        fileBtn.textContent = node.name;
        fileBtn.onclick = () => openFileInEditor(node.path);
        container.appendChild(fileBtn);
      });
    }

    async function loadFileExplorer() {
      const treeContainer = document.getElementById("file-explorer-tree");
      if (!treeContainer) return;

      treeContainer.textContent = "Loading files...";
      const result = await aiService.getWorkspaceTree(4);

      if (result.error) {
        treeContainer.textContent = "Failed to load files.";
        writeToConsole(`Explorer load failed: ${result.error}`, "error");
        return;
      }

      treeContainer.innerHTML = "";
      renderExplorerNodes(result.tree || [], treeContainer, 0);
    }

    return {
      openFileInEditor,
      loadFileExplorer,
    };
  }

  globalScope.workhorseExplorerModule = {
    createExplorerRuntime,
  };
})(window);