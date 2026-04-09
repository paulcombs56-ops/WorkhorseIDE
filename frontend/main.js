const aiService = window.aiService;
const consoleRuntime = window.workhorseConsoleModule.initializeConsoleRuntime();
const { writeToConsole, clearConsole, setAiStatus, setAiPanelOutput } = consoleRuntime;
const editorRuntime = window.workhorseEditorModule.initializeEditorRuntime();
const contextRuntime = window.workhorseContextModule.initializeContextRuntime();
const composerRuntime = window.workhorseComposerModule.initializeComposerRuntime();
const pickerRuntime = window.workhorseContextPickerModal.initializeContextPickerRuntime();

const appState = {
  executionRuntime: null,
  explorerRuntime: null,
  commandHistory: [],
  historyIndex: -1,
  currentWorkspaceFilePath: "",
  currentFileContent: "",
  autoRenderEnabled: false,
  splitPreviewEnabled: false,
  pendingBlueprint: null,
  undoHistory: [],
  lastUndoId: "",
  lastRequest: null,
  renderDebounce: null,
  renderRequestId: 0,
};

function getEditor() {
  return editorRuntime.getEditor();
}

function getRenderMode() {
  const language = String(document.getElementById("language-select")?.value || "").toLowerCase();
  const pathValue = String(appState.currentWorkspaceFilePath || "").toLowerCase();

  if (language === "html" || pathValue.endsWith(".html") || pathValue.endsWith(".htm")) {
    return "html";
  }

  if (language === "css" || pathValue.endsWith(".css")) {
    return "css";
  }

  if (language === "javascript" || pathValue.endsWith(".js") || pathValue.endsWith(".jsx")) {
    return "javascript";
  }

  return "none";
}

function isRenderable() {
  return getRenderMode() !== "none";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isExternalAsset(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("//") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("#")
  );
}

function resolveWorkspaceAssetPath(baseFilePath, assetPath) {
  const normalizedAsset = String(assetPath || "").replace(/\\/g, "/").trim();
  if (!normalizedAsset) {
    return "";
  }

  if (isExternalAsset(normalizedAsset)) {
    return normalizedAsset;
  }

  const assetSegments = normalizedAsset.startsWith("/")
    ? normalizedAsset.replace(/^\/+/, "").split("/")
    : [
        ...String(baseFilePath || "")
          .replace(/\\/g, "/")
          .split("/")
          .slice(0, -1),
        ...normalizedAsset.split("/"),
      ];

  const resolved = [];
  assetSegments.forEach((segment) => {
    if (!segment || segment === ".") {
      return;
    }
    if (segment === "..") {
      resolved.pop();
      return;
    }
    resolved.push(segment);
  });

  return resolved.join("/");
}

function renderPreviewPlaceholder(message) {
  const empty = document.getElementById("render-empty-state");
  const frame = document.getElementById("render-frame");
  if (!empty || !frame) return;
  empty.hidden = false;
  empty.textContent = message;
  frame.style.display = "none";
}

function buildJavaScriptPreviewDocument(code, filePath) {
  const safeCode = String(code || "").replace(/<\/script>/gi, "<\\/script>");
  const title = escapeHtml(filePath || "JavaScript Preview");

  return [
    "<!doctype html>",
    "<html>",
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    `    <title>${title}</title>`,
    "    <style>",
    "      :root { color-scheme: dark; }",
    "      html, body { margin: 0; min-height: 100%; background: #0b1730; color: #f7eadc; font-family: Consolas, \"Courier New\", monospace; }",
    "      .preview-shell { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; }",
    "      .preview-header { padding: 12px 16px; border-bottom: 1px solid #274f87; background: linear-gradient(180deg, #10254b, #0d1d3b); }",
    "      .preview-title { font-size: 13px; font-weight: 700; }",
    "      .preview-subtitle { margin-top: 4px; font-size: 11px; color: #c7b6a7; }",
    "      #app { padding: 20px; }",
    "      .preview-console { border-top: 1px solid #274f87; background: #091426; padding: 12px 16px; }",
    "      .preview-console-title { font-size: 11px; color: #c7b6a7; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.06em; }",
    "      #console-output { display: flex; flex-direction: column; gap: 6px; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.45; }",
    "      .console-line { color: #e9d8c5; }",
    "      .console-line.error { color: #ffad8f; }",
    "      .console-line.warn { color: #ffd28d; }",
    "    </style>",
    "  </head>",
    "  <body>",
    "    <div class=\"preview-shell\">",
    "      <div class=\"preview-header\">",
    `        <div class=\"preview-title\">${title}</div>`,
    "        <div class=\"preview-subtitle\">Running in an isolated preview iframe. Use #app if you want to mount UI.</div>",
    "      </div>",
    "      <div id=\"app\"></div>",
    "      <div class=\"preview-console\">",
    "        <div class=\"preview-console-title\">Runtime Output</div>",
    "        <div id=\"console-output\"></div>",
    "      </div>",
    "    </div>",
    "    <script>",
    "      const output = document.getElementById(\"console-output\");",
    "      const appendLine = (text, tone = \"log\") => { const line = document.createElement(\"div\"); line.className = \"console-line \" + tone; line.textContent = String(text); output.appendChild(line); };",
    "      const formatArg = (value) => { if (typeof value === \"string\") return value; try { return JSON.stringify(value, null, 2); } catch { return String(value); } };",
    "      const nativeConsole = { log: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };",
    "      console.log = (...args) => { nativeConsole.log(...args); appendLine(args.map(formatArg).join(\" \"), \"log\"); };",
    "      console.warn = (...args) => { nativeConsole.warn(...args); appendLine(args.map(formatArg).join(\" \"), \"warn\"); };",
    "      console.error = (...args) => { nativeConsole.error(...args); appendLine(args.map(formatArg).join(\" \"), \"error\"); };",
    "      window.addEventListener(\"error\", (event) => { appendLine(event.message || \"Unknown runtime error\", \"error\"); });",
    "      window.addEventListener(\"unhandledrejection\", (event) => { const reason = event.reason?.message || event.reason || \"Unhandled promise rejection\"; appendLine(reason, \"error\"); });",
    "      try {",
    safeCode,
    "      } catch (error) { appendLine(error?.stack || error?.message || String(error), \"error\"); }",
    "      if (!output.hasChildNodes()) { appendLine(\"No console output. Script loaded successfully.\"); }",
    "    <\/script>",
    "  </body>",
    "</html>",
  ].join("\n");
}

function buildCssPreviewDocument(code, filePath) {
  const safeCode = String(code || "").replace(/<\/style>/gi, "<\\/style>");
  const title = escapeHtml(filePath || "CSS Preview");

  return [
    "<!doctype html>",
    "<html>",
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    `    <title>${title}</title>`,
    "    <style>",
    "      body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #081326, #112a4e); color: #f3e7db; }",
    "      .preview-shell { padding: 24px; display: grid; gap: 20px; }",
    "      .preview-card { border: 1px solid rgba(109, 150, 214, 0.45); border-radius: 14px; padding: 20px; background: rgba(10, 25, 48, 0.82); box-shadow: 0 14px 32px rgba(0, 0, 0, 0.26); }",
    "      .preview-pills { display: flex; gap: 8px; flex-wrap: wrap; }",
    "      .preview-pill { padding: 6px 10px; border-radius: 999px; background: #1d4d86; }",
    "    </style>",
    `    <style>${safeCode}</style>`,
    "  </head>",
    "  <body>",
    "    <div class=\"preview-shell\">",
    "      <div class=\"preview-card\">",
    "        <h1>CSS Preview</h1>",
    "        <p>This surface lets you preview standalone stylesheet files without needing an HTML entry file.</p>",
    "        <button>Sample Button</button>",
    "      </div>",
    "      <div class=\"preview-card\">",
    "        <div class=\"preview-pills\">",
    "          <span class=\"preview-pill\">Primary</span>",
    "          <span class=\"preview-pill\">Secondary</span>",
    "          <span class=\"preview-pill\">Accent</span>",
    "        </div>",
    "      </div>",
    "    </div>",
    "  </body>",
    "</html>",
  ].join("\n");
}

async function buildHtmlPreviewDocument(html, filePath) {
  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(String(html || ""), "text/html");

  const links = Array.from(documentRoot.querySelectorAll('link[rel="stylesheet"][href]'));
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const resolvedPath = resolveWorkspaceAssetPath(filePath, href);
    if (!resolvedPath || isExternalAsset(resolvedPath)) {
      continue;
    }

    const result = await aiService.getWorkspaceFile(resolvedPath);
    const style = documentRoot.createElement("style");
    style.setAttribute("data-workhorse-source", resolvedPath);
    style.textContent = result.error
      ? `/* Failed to load ${resolvedPath}: ${result.error} */`
      : String(result.content || "");
    link.replaceWith(style);
  }

  const scripts = Array.from(documentRoot.querySelectorAll("script[src]"));
  for (const script of scripts) {
    const src = script.getAttribute("src") || "";
    const resolvedPath = resolveWorkspaceAssetPath(filePath, src);
    if (!resolvedPath || isExternalAsset(resolvedPath)) {
      continue;
    }

    const result = await aiService.getWorkspaceFile(resolvedPath);
    const inlineScript = documentRoot.createElement("script");
    inlineScript.setAttribute("data-workhorse-source", resolvedPath);
    inlineScript.textContent = result.error
      ? `console.error(${JSON.stringify(`Failed to load ${resolvedPath}: ${result.error}`)});`
      : String(result.content || "").replace(/<\/script>/gi, "<\\/script>");
    script.replaceWith(inlineScript);
  }

  return documentRoot.documentElement.outerHTML;
}

function updatePreviewControlState() {
  const splitToggle = document.getElementById("split-preview-toggle");
  if (!splitToggle) {
    return;
  }

  splitToggle.disabled = !appState.autoRenderEnabled || !isRenderable();
  if (!appState.autoRenderEnabled || !isRenderable()) {
    splitToggle.checked = false;
    appState.splitPreviewEnabled = false;
  }
}

async function updateCenterPanel() {
  const editorHost = document.getElementById("editor-host");
  const renderHost = document.getElementById("render-host");
  const title = document.getElementById("center-panel-title");
  const subtitle = document.getElementById("center-panel-subtitle");
  const frame = document.getElementById("render-frame");
  const empty = document.getElementById("render-empty-state");
  const panelBody = document.getElementById("center-panel-body");
  const renderRequestId = ++appState.renderRequestId;

  if (!editorHost || !renderHost || !title || !subtitle || !frame || !empty || !panelBody) {
    return;
  }

  updatePreviewControlState();
  panelBody.classList.toggle("center-panel-body--split", appState.autoRenderEnabled && appState.splitPreviewEnabled);

  if (!appState.autoRenderEnabled) {
    editorHost.hidden = false;
    renderHost.hidden = true;
    title.textContent = appState.currentWorkspaceFilePath ? `Editor: ${appState.currentWorkspaceFilePath}` : "Editor";
    subtitle.textContent = "Open files here or turn on Auto Render for HTML, CSS, or JavaScript preview.";
    getEditor()?.layout?.();
    return;
  }

  editorHost.hidden = !appState.splitPreviewEnabled;
  renderHost.hidden = false;
  title.textContent = appState.currentWorkspaceFilePath ? `Preview: ${appState.currentWorkspaceFilePath}` : "Preview";
  subtitle.textContent = "Auto render is on. Renderable files are previewed in this center panel.";

  const renderMode = getRenderMode();
  if (renderMode === "none") {
    renderPreviewPlaceholder("Auto render is enabled, but the current file is not renderable. Open an HTML, CSS, or JavaScript file or switch Auto Render off.");
    return;
  }

  const content = String(getEditor()?.getValue?.() || appState.currentFileContent || "");

  if (renderMode === "javascript") {
    subtitle.textContent = "Auto render is on. JavaScript runs in an isolated preview iframe with runtime output.";
    frame.srcdoc = buildJavaScriptPreviewDocument(content, appState.currentWorkspaceFilePath);
  } else if (renderMode === "css") {
    subtitle.textContent = "Auto render is on. CSS files render against a sample preview document.";
    frame.srcdoc = buildCssPreviewDocument(content, appState.currentWorkspaceFilePath);
  } else {
    subtitle.textContent = "Auto render is on. HTML content is previewed with linked local JS and CSS inlined from the workspace.";
    const previewDocument = await buildHtmlPreviewDocument(content, appState.currentWorkspaceFilePath);
    if (renderRequestId !== appState.renderRequestId) {
      return;
    }
    frame.srcdoc = previewDocument;
  }

  frame.style.display = "block";
  empty.hidden = true;
  if (!editorHost.hidden) {
    getEditor()?.layout?.();
  }
}

function scheduleCenterRender() {
  if (!appState.autoRenderEnabled) {
    return;
  }

  window.clearTimeout(appState.renderDebounce);
  appState.renderDebounce = window.setTimeout(() => {
    void updateCenterPanel();
  }, 120);
}

function syncFileChip(filePath, content) {
  if (!filePath) {
    return;
  }

  contextRuntime.getChips().filter((chip) => chip.type === "file").forEach((chip) => contextRuntime.removeChip(chip.id));
  contextRuntime.addChip(
    "file",
    {
      path: filePath,
      label: `📄 ${filePath.split("/").pop() || filePath}`,
    },
    content || ""
  );
}

function syncSelectionChip() {
  const editor = getEditor();
  if (!editor || !editor.getModel()) {
    return;
  }

  contextRuntime.getChips().filter((chip) => chip.type === "selection").forEach((chip) => contextRuntime.removeChip(chip.id));

  const selection = editor.getSelection();
  const selectedText = editor.getModel().getValueInRange(selection);
  if (!selectedText || !selectedText.trim()) {
    return;
  }

  contextRuntime.addChip(
    "selection",
    {
      path: appState.currentWorkspaceFilePath,
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber,
      label: `⚡ Selection: ${selection.endLineNumber - selection.startLineNumber + 1} lines`,
    },
    selectedText
  );
}

function renderContextChips() {
  const container = document.getElementById("context-chips-container");
  if (!container) return;

  container.innerHTML = "";
  contextRuntime.getVisibleChips().forEach((chip) => {
    const chipEl = document.createElement("div");
    chipEl.className = "chip";

    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = chip.label;

    const removeBtn = document.createElement("button");
    removeBtn.className = "chip-remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      contextRuntime.removeChip(chip.id);
      renderContextChips();
    });

    chipEl.appendChild(label);
    chipEl.appendChild(removeBtn);
    container.appendChild(chipEl);
  });

  if (contextRuntime.hasHiddenChips()) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "context-add-btn";
    moreBtn.type = "button";
    moreBtn.textContent = `+ ${contextRuntime.getHiddenChipCount()} more`;
    moreBtn.addEventListener("click", () => pickerRuntime.openContextPicker());
    container.appendChild(moreBtn);
  }
}

function renderUndoHistory() {
  const select = document.getElementById("context-undo-select");
  const undoBtn = document.getElementById("context-undo-btn");
  if (!select || !undoBtn) return;

  const current = select.value;
  select.innerHTML = '<option value="">Undo history</option>';

  appState.undoHistory.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.undoId;
    option.textContent = entry.summary || entry.undoId;
    select.appendChild(option);
  });

  if (current && appState.undoHistory.some((entry) => entry.undoId === current)) {
    select.value = current;
  }

  undoBtn.disabled = appState.undoHistory.length === 0;
}

async function loadUndoHistory() {
  const result = await aiService.agentUndoHistory();
  appState.undoHistory = Array.isArray(result.entries) ? result.entries : [];
  renderUndoHistory();
}

function buildAgentPayload() {
  return {
    prompt: composerRuntime.getComposerText(),
    mode: composerRuntime.getSelectedMode(),
    context: contextRuntime.serializeChips(),
    allowHighRisk: false,
  };
}

function logConsultResponse(response) {
  writeToConsole(response.summary || "No consult summary returned.", "result");
  (response.questions || []).forEach((question) => writeToConsole(`Q: ${question}`, "log"));
  (response.tradeoffs || []).forEach((tradeoff) => writeToConsole(`Tradeoff: ${tradeoff}`, "log"));
}

function logBlueprintResponse(response) {
  writeToConsole(response.title || "Blueprint ready", "result");
  (response.steps || []).forEach((step, index) => writeToConsole(`${index + 1}. ${step}`, "log"));
  (response.operations || []).forEach((operation, index) => writeToConsole(`${index + 1}. ${operation.op} ${operation.path}`, "log"));
  (response.notes || []).forEach((note) => writeToConsole(`Note: ${note}`, "log"));
}

async function runCurrentMode(payload) {
  const mode = payload.mode || "consult";
  composerRuntime.disableComposer();

  try {
    if (mode === "consult") {
      const response = await aiService.agentConsult(payload.prompt, payload.context);
      appState.lastRequest = payload;
      logConsultResponse(response);
      return;
    }

    if (mode === "blueprint") {
      const response = await aiService.agentBlueprint(payload.prompt, payload.context);
      appState.pendingBlueprint = response;
      appState.lastRequest = payload;
      composerRuntime.enableForgeMode(Array.isArray(response.operations) && response.operations.length > 0);
      logBlueprintResponse(response);
      return;
    }

    if (mode === "forge") {
      const operations = appState.pendingBlueprint?.operations || [];
      if (operations.length === 0) {
        writeToConsole("No staged blueprint operations available. Run Blueprint first.", "error");
        return;
      }

      const response = await aiService.agentForge(
        operations,
        appState.pendingBlueprint?.title || payload.prompt || "Forge execution",
        { allowHighRisk: payload.allowHighRisk }
      );

      if (response.error) {
        writeToConsole(`Forge failed: ${response.error}`, "error");
      } else {
        writeToConsole(`Forge finished: ${response.successCount} succeeded, ${response.failureCount} failed.`, "result");
      }

      appState.lastUndoId = response.undoId || "";
      appState.lastRequest = payload;
      await loadUndoHistory();
      composerRuntime.enableForgeMode(false);
      appState.pendingBlueprint = null;
      return;
    }
  } catch (error) {
    writeToConsole(`Request failed: ${error.message}`, "error");
  } finally {
    composerRuntime.enableComposer();
  }
}

function initializeKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      if (appState.historyIndex > 0 && getEditor()) {
        appState.historyIndex -= 1;
        getEditor().setValue(appState.commandHistory[appState.historyIndex]);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (appState.historyIndex < appState.commandHistory.length - 1 && getEditor()) {
        appState.historyIndex += 1;
        getEditor().setValue(appState.commandHistory[appState.historyIndex]);
      } else if (getEditor()) {
        appState.historyIndex = appState.commandHistory.length;
        getEditor().setValue("");
      }
      return;
    }

    if (event.ctrlKey && event.key === "Enter") {
      document.getElementById("run-btn")?.click();
    }
  });
}

function wireCenterPanelControls() {
  document.getElementById("language-select")?.addEventListener("change", () => {
    updatePreviewControlState();
    scheduleCenterRender();
    void updateCenterPanel();
  });

  document.getElementById("auto-render-toggle")?.addEventListener("change", (event) => {
    appState.autoRenderEnabled = Boolean(event.target.checked);
    updatePreviewControlState();
    void updateCenterPanel();
  });

  document.getElementById("split-preview-toggle")?.addEventListener("change", (event) => {
    appState.splitPreviewEnabled = Boolean(event.target.checked);
    void updateCenterPanel();
  });

  document.getElementById("mode-refresh-btn")?.addEventListener("click", async () => {
    if (!appState.lastRequest) {
      writeToConsole("No previous request to refresh.", "error");
      return;
    }
    await runCurrentMode({ ...appState.lastRequest });
  });

  document.getElementById("context-undo-refresh-btn")?.addEventListener("click", () => {
    loadUndoHistory();
  });

  document.getElementById("context-undo-btn")?.addEventListener("click", async () => {
    const selectedUndoId = document.getElementById("context-undo-select")?.value || appState.lastUndoId;
    if (!selectedUndoId) {
      writeToConsole("No undo entry selected.", "error");
      return;
    }

    const result = await aiService.agentUndo(selectedUndoId);
    if (result.error || result.success === false) {
      writeToConsole(`Undo failed: ${result.error || "Unknown error"}`, "error");
      return;
    }

    writeToConsole(`Undo complete for ${selectedUndoId}`, "result");
    await loadUndoHistory();
    appState.explorerRuntime?.loadFileExplorer?.();
  });

  document.getElementById("composer-send-btn")?.addEventListener("click", async () => {
    if (composerRuntime.isSendDisabled()) {
      return;
    }

    await runCurrentMode(buildAgentPayload());
  });
}

function wireContextEvents() {
  contextRuntime.on("onChipsChanged", () => {
    renderContextChips();
  });

  pickerRuntime.on("onContextPickerClosed", (selectedItems) => {
    if (!Array.isArray(selectedItems)) return;

    selectedItems.forEach((item) => {
      contextRuntime.addChip(
        item.type,
        {
          path: item.path,
          label: item.label,
          startLine: item.startLine,
          endLine: item.endLine,
        },
        item.value || ""
      );
    });

    renderContextChips();
  });
}

function waitForEditorReady(callback) {
  const interval = window.setInterval(() => {
    const editor = getEditor();
    if (!editor || !editor.getModel()) {
      return;
    }

    window.clearInterval(interval);
    editor.onDidChangeModelContent(() => {
      appState.currentFileContent = editor.getValue();
      scheduleCenterRender();
    });
    editor.onDidChangeCursorSelection(() => {
      syncSelectionChip();
    });
    callback(editor);
  }, 100);
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
    getEditor,
    getLanguage: () => document.getElementById("language-select").value,
  });

  appState.explorerRuntime = window.workhorseExplorerModule.createExplorerRuntime({
    aiService,
    writeToConsole,
    setCurrentWorkspaceFilePath: (value) => {
      appState.currentWorkspaceFilePath = value || "";
      void updateCenterPanel();
    },
    isExecutablePath: (filePath) => appState.executionRuntime?.isExecutablePath(filePath),
    getEditor,
    getLanguage: () => document.getElementById("language-select").value || "javascript",
    setLanguage: (value) => {
      document.getElementById("language-select").value = value;
      scheduleCenterRender();
    },
    onFileOpened: ({ path, content }) => {
      appState.currentWorkspaceFilePath = path || "";
      appState.currentFileContent = content || "";
      syncFileChip(path, content);
      void updateCenterPanel();
    },
  });

  window.workhorsePanelResizerModule.initializePanelResizers(() => getEditor());
  appState.explorerRuntime.loadFileExplorer();
  window.workhorseAiFeaturesModule.initializeAiFeatureHandlers({
    aiService,
    clearConsole,
    writeToConsole,
    setAiPanelOutput,
    setAiStatus,
  });

  wireContextEvents();
  wireCenterPanelControls();
  initializeKeyboardShortcuts();
  await loadUndoHistory();
  renderContextChips();
  updatePreviewControlState();
  await updateCenterPanel();

  document.getElementById("explorer-add-directory-btn")?.addEventListener("click", () => {
    appState.explorerRuntime?.promptForDirectory?.();
  });

  waitForEditorReady((editor) => {
    appState.currentFileContent = editor.getValue();
    void updateCenterPanel();
  });
}

bootstrapApp();
