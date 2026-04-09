(function initWorkhorseEditorModule(globalScope) {
  function getStarterText(language) {
    if (language === "html") {
      return [
        "<!doctype html>",
        "<html>",
        "  <head>",
        "    <meta charset=\"utf-8\" />",
        "    <title>Workhorse Preview</title>",
        "  </head>",
        "  <body>",
        "    <h1>Hello from Workhorse</h1>",
        "  </body>",
        "</html>",
      ].join("\n");
    }

    if (language === "css") {
      return [
        ":root {",
        "  --card-bg: #102a4f;",
        "  --card-border: #2b67ad;",
        "  --card-text: #f6ece4;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        "  font-family: Arial, sans-serif;",
        "  background: linear-gradient(180deg, #0b1730, #10254b);",
        "  color: var(--card-text);",
        "}",
      ].join("\n");
    }

    if (language === "python") {
      return "# Python Mode\nprint(\"Hello from Python!\")";
    }

    return "// JavaScript Mode\nconsole.log(\"Hello from JavaScript!\");";
  }

  function initializeEditorRuntime() {
    require.config({
      paths: {
        vs: "./vendor/monaco/vs",
      },
    });

    require(["vs/editor/editor.main"], () => {
      globalScope.editor = monaco.editor.create(document.getElementById("editor"), {
        value: "// Welcome to Workhorse IDE\n// Start typing your code here...",
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
      });
    });

    document.getElementById("language-select").addEventListener("change", (event) => {
      const newLang = event.target.value;

      if (!globalScope.editor?.getModel()) {
        return;
      }

      monaco.editor.setModelLanguage(globalScope.editor.getModel(), newLang);

      const currentValue = String(globalScope.editor.getValue() || "").trim();
      if (!currentValue || currentValue.includes("Welcome to Workhorse IDE") || currentValue.includes("Hello from")) {
        globalScope.editor.setValue(getStarterText(newLang));
      }
    });

    return {
      getEditor() {
        return globalScope.editor;
      },
    };
  }

  globalScope.workhorseEditorModule = {
    initializeEditorRuntime,
  };
})(window);
