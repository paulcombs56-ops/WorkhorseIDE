(function initWorkhorseAiFeaturesModule(globalScope) {
  function initializeAiFeatureHandlers(runtime) {
    const { aiService, clearConsole, writeToConsole, setAiPanelOutput, setAiStatus } = runtime;

    document.getElementById("analyze-btn").onclick = async () => {
      const code = globalScope.editor.getValue();
      const lang = document.getElementById("language-select").value;

      clearConsole();
      writeToConsole("🔍 Analyzing code...", "log");

      const result = await aiService.analyzeCode(code, lang);

      const aiSummary = {
        issues: result.issues || [],
        suggestions: result.suggestions || [],
      };
      setAiPanelOutput(JSON.stringify(aiSummary, null, 2));

      if (result.issues && result.issues.length > 0) {
        writeToConsole("Found issues:", "error");
        result.issues.forEach((issue) => {
          writeToConsole(`  Line ${issue.line || "?"}: ${issue.message}`, "error");
        });
      } else {
        writeToConsole("✅ No issues found!", "result");
      }

      if (result.suggestions && result.suggestions.length > 0) {
        writeToConsole("\nSuggestions:", "log");
        result.suggestions.forEach((suggestion) => {
          writeToConsole(`  • ${suggestion}`, "log");
        });
      }
    };

    document.getElementById("refactor-btn").onclick = async () => {
      const code = globalScope.editor.getValue();
      const lang = document.getElementById("language-select").value;

      const refactorType = prompt(
        "Choose refactoring type:\n1. simplify\n2. extract-function\n3. rename-variable\n4. optimize",
        "simplify"
      );

      if (!refactorType) return;

      clearConsole();
      writeToConsole("♻️ Refactoring code...", "log");

      const result = await aiService.refactorCode(code, lang, refactorType);

      setAiPanelOutput(
        JSON.stringify(
          {
            refactored_code: result.refactored_code,
            explanation: result.explanation,
          },
          null,
          2
        )
      );

      globalScope.editor.setValue(result.refactored_code);
      writeToConsole("Refactoring explanation:", "result");
      writeToConsole(result.explanation, "log");
      writeToConsole("✅ Code refactored! Review the changes above.", "result");
    };

    document.getElementById("docs-btn").onclick = async () => {
      const code = globalScope.editor.getValue();
      const lang = document.getElementById("language-select").value;

      const style = prompt("Choose documentation style:\n1. google\n2. numpy\n3. sphinx", "google");
      if (!style) return;

      clearConsole();
      writeToConsole("📚 Generating documentation...", "log");

      const result = await aiService.generateDocumentation(code, lang, style);

      setAiPanelOutput(result.documentation || "No documentation returned.");
      globalScope.editor.setValue(result.documentation);
      writeToConsole("✅ Documentation generated! Review the formatted code.", "result");
    };

    document.getElementById("ai-health-btn").onclick = async () => {
      clearConsole();
      writeToConsole("🤖 Checking AI backend status...", "log");

      const health = await aiService.checkHealth();

      if (health.status === "error") {
        setAiStatus("offline", "Offline");
        setAiPanelOutput(`Status: Offline\nError: ${health.message || "Unknown error"}`);
        writeToConsole("❌ AI Backend Offline", "error");
        writeToConsole(`Error: ${health.message}`, "error");
        writeToConsole("\nMake sure to start the AI backend:", "log");
        writeToConsole("1. Ensure Ollama is running: ollama serve", "log");
        writeToConsole("2. Start Python backend: cd ai_backend && python main.py", "log");
        writeToConsole("3. Run npm install in backend folder", "log");
        return;
      }

      setAiStatus("online", "Online");
      setAiPanelOutput(
        JSON.stringify(
          {
            status: health.status || "ok",
            provider: health.provider || "unknown",
            model: health.model || "default",
            chat_model: health.chat_model || "",
            chat_model_reason: health.chat_model_reason || "",
            adaptive_model_routing: Boolean(health.adaptive_model_routing),
            detected_gpu_vram_gb: health.detected_gpu_vram_gb ?? null,
          },
          null,
          2
        )
      );
      writeToConsole("✅ AI Backend Online", "result");
      writeToConsole(`Provider: ${health.provider || "unknown"}`, "log");
      writeToConsole(`Model: ${health.model || "default"}`, "log");

      const models = await aiService.listModels();
      if (models.models && models.models.length > 0) {
        writeToConsole("\nAvailable Models:", "log");
        models.models.forEach((modelName) => writeToConsole(`  • ${modelName}`, "log"));
      }
    };
  }

  globalScope.workhorseAiFeaturesModule = {
    initializeAiFeatureHandlers,
  };
})(window);