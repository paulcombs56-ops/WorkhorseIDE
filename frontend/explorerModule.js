(function initWorkhorseExplorerModule(globalScope) {
  function detectLanguageFromPath(filePath = "", fallbackLanguage = "javascript") {
    const lower = String(filePath || "").toLowerCase();
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    if (lower.endsWith(".css")) return "css";
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
      onFileOpened,
    } = runtime;

    async function promptForDirectory() {
      if (globalScope.workhorseElectron?.pickFolder) {
        const result = await globalScope.workhorseElectron.pickFolder();
        if (result?.changed) {
          writeToConsole(`Workspace changed to ${result.workspaceRoot}. The app will relaunch.`, "result");
        }
        return;
      }

      alert("Add Directory is available in the Electron app. In the browser build, set WORKSPACE_ROOT for the backend and reload Workhorse.");
    }

    function renderEmptyExplorerState(container, message) {
      container.innerHTML = "";

      const shell = document.createElement("div");
      shell.className = "explorer-empty-state";

      const text = document.createElement("div");
      text.className = "explorer-empty-copy";
      text.textContent = message;

      const button = document.createElement("button");
      button.className = "explorer-empty-btn";
      button.type = "button";
      button.textContent = "Add Directory";
      button.addEventListener("click", promptForDirectory);

      shell.appendChild(text);
      shell.appendChild(button);
      container.appendChild(shell);
    }

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
      onFileOpened?.({ path: relativePath, content: result.content || "", language });
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
        renderEmptyExplorerState(treeContainer, "No workspace is configured yet.");
        writeToConsole(`Explorer load failed: ${result.error}`, "error");
        return;
      }

      if (!Array.isArray(result.tree) || result.tree.length === 0) {
        renderEmptyExplorerState(treeContainer, "No files found. Add a directory to start browsing files.");
        return;
      }

      treeContainer.innerHTML = "";
      renderExplorerNodes(result.tree || [], treeContainer, 0);
    }

    return {
      openFileInEditor,
      loadFileExplorer,
      promptForDirectory,
    };
  }

  globalScope.workhorseExplorerModule = {
    createExplorerRuntime,
  };
})(window);
