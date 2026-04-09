(function initWorkhorseConsoleModule(globalScope) {
  function initializeConsoleRuntime() {
    function writeToConsole(msg, type = "log") {
      const consoleEl = document.getElementById("console");

      const line = document.createElement("div");
      line.classList.add("console-line");

      const timestamp = document.createElement("span");
      timestamp.classList.add("console-timestamp");
      timestamp.textContent = `[${new Date().toLocaleTimeString()}] `;

      const text = document.createElement("span");
      text.textContent = msg;

      if (type === "error") text.classList.add("console-error");
      else if (type === "result") text.classList.add("console-result");
      else text.classList.add("console-log");

      line.appendChild(timestamp);
      line.appendChild(text);
      consoleEl.appendChild(line);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function clearConsole() {
      document.getElementById("console").innerHTML = "";
    }

    function setConsoleTheme(theme) {
      const consoleEl = document.getElementById("console");
      consoleEl.classList.remove("console-dark", "console-neon", "console-hacker");

      if (theme === "dark") consoleEl.classList.add("console-dark");
      if (theme === "neon") consoleEl.classList.add("console-neon");
      if (theme === "hacker") consoleEl.classList.add("console-hacker");
    }

    function setAiStatus(state, label) {
      const badge = document.getElementById("ai-status-badge");
      badge.classList.remove("online", "offline", "unknown");
      badge.classList.add(state);
      badge.textContent = label;
    }

    function setAiPanelOutput(text) {
      const output = document.getElementById("ai-panel-output");
      output.textContent = text;
    }

    function isNearBottom(container, threshold = 36) {
      if (!container) return true;
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      return remaining <= threshold;
    }

    function scrollToBottom(container) {
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    }

    document.getElementById("clear-console-btn").onclick = clearConsole;
    document.getElementById("console-theme").addEventListener("change", (event) => {
      setConsoleTheme(event.target.value);
    });
    setConsoleTheme("dark");

    return {
      writeToConsole,
      clearConsole,
      setAiStatus,
      setAiPanelOutput,
      isNearBottom,
      scrollToBottom,
    };
  }

  globalScope.workhorseConsoleModule = {
    initializeConsoleRuntime,
  };
})(window);