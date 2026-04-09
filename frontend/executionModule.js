(function initWorkhorseExecutionModule(globalScope) {
  function isExecutablePath(filePath = "") {
    return String(filePath || "").toLowerCase().endsWith(".exe");
  }

  async function runExecutable(aiService, writeToConsole, relativePath) {
    writeToConsole(`Launching executable: ${relativePath}`, "log");
    const result = await aiService.launchExecutable(relativePath, []);

    if (result.error || !result.launched) {
      writeToConsole(`Executable launch failed: ${result.error || "Unknown error"}`, "error");
      return;
    }

    const pidText = result.pid ? ` (pid ${result.pid})` : "";
    writeToConsole(`Started ${result.path}${pidText}`, "result");
  }

  function runJavaScript(writeToConsole, code) {
    writeToConsole("Opening JavaScript run in browser tab...", "log");

    const safeCode = String(code || "").replace(/<\/script>/gi, "<\\/script>");
    const documentHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Workhorse JavaScript Run</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        background: #ffffff;
        color: #111;
      }

      .run-shell {
        padding: 16px;
      }

      .run-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      #run-output {
        white-space: pre-wrap;
        border: 1px solid #ddd;
        background: #fafafa;
        border-radius: 8px;
        min-height: 120px;
        padding: 10px;
        font-family: Consolas, "Courier New", monospace;
        font-size: 13px;
        line-height: 1.45;
      }

      .line-error { color: #c42b1c; }
    </style>
  </head>
  <body>
    <div class="run-shell">
      <div class="run-title">JavaScript Output</div>
      <div id="run-output">(running...)</div>
    </div>
    <script>
      const __out = document.getElementById("run-output");
      const __append = (text, isError = false) => {
        const line = document.createElement("div");
        if (isError) {
          line.className = "line-error";
        }
        line.textContent = String(text);
        __out.appendChild(line);
      };

      __out.textContent = "";

      const __origLog = console.log.bind(console);
      const __origWarn = console.warn.bind(console);
      const __origError = console.error.bind(console);

      console.log = (...args) => {
        __origLog(...args);
        __append(args.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" "));
      };

      console.warn = (...args) => {
        __origWarn(...args);
        __append("WARN: " + args.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" "));
      };

      console.error = (...args) => {
        __origError(...args);
        __append("ERROR: " + args.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" "), true);
      };

      window.addEventListener("error", (event) => {
        __append("ERROR: " + event.message, true);
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason?.message || event.reason || "Unhandled promise rejection";
        __append("ERROR: " + reason, true);
      });

${safeCode}

      if (!__out.hasChildNodes()) {
        __append("(No console output)");
      }
    <\/script>
  </body>
</html>`;

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      writeToConsole("Popup blocked by browser. Allow popups for this page.", "error");
      return;
    }

    popup.document.open();
    popup.document.write(documentHtml);
    popup.document.close();
  }

  function runPython(writeToConsole, code) {
    writeToConsole("Running Python...", "log");

    const stream = new EventSource(`http://localhost:3001/run-python-stream?code=${encodeURIComponent(code)}`);
    stream.onmessage = (event) => {
      if (event.data === "__END__") {
        stream.close();
        return;
      }

      if (event.data === "__START__") {
        return;
      }

      if (event.data.startsWith("ERROR:")) {
        writeToConsole(event.data.replace("ERROR:", "").trim(), "error");
      } else {
        writeToConsole(event.data, "result");
      }
    };

    stream.onerror = () => {
      writeToConsole("Stream connection lost.", "error");
      stream.close();
    };
  }

  function initializeExecutionRuntime(runtime) {
    const {
      aiService,
      clearConsole,
      writeToConsole,
      getCurrentWorkspaceFilePath,
      onCodeExecuted,
      getEditor,
      getLanguage,
    } = runtime;

    document.getElementById("format-btn").onclick = async () => {
      const editor = getEditor();
      if (!editor) return;

      const code = editor.getValue();
      const lang = getLanguage();

      try {
        const response = await fetch("http://localhost:3001/format-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language: lang }),
        });

        const data = await response.json();

        if (data.error) {
          writeToConsole(`Format error: ${data.error}`, "error");
        } else {
          editor.setValue(data.formatted);
          writeToConsole(`${lang} code formatted!`, "result");
        }
      } catch (error) {
        writeToConsole(`Format request failed: ${error.message}`, "error");
      }
    };

    document.getElementById("run-btn").onclick = () => {
      const editor = getEditor();
      if (!editor) return;

      const code = editor.getValue();
      const lang = getLanguage();

      clearConsole();
      onCodeExecuted(code);

      const currentWorkspaceFilePath = getCurrentWorkspaceFilePath();
      if (isExecutablePath(currentWorkspaceFilePath)) {
        runExecutable(aiService, writeToConsole, currentWorkspaceFilePath);
        return;
      }

      if (lang === "javascript") {
        runJavaScript(writeToConsole, code);
      } else if (lang === "python") {
        runPython(writeToConsole, code);
      }
    };

    return {
      isExecutablePath,
    };
  }

  globalScope.workhorseExecutionModule = {
    initializeExecutionRuntime,
  };
})(window);