(function initWorkhorseEditorModule(globalScope) {
  function initializeEditorRuntime() {
    require.config({
      paths: {
        vs: "./vendor/monaco/vs",
      },
    });

    require(["vs/editor/editor.main"], () => {
      globalScope.editor = monaco.editor.create(document.getElementById("editor"), {
        value: `// Welcome to Workhorse IDE\n// Start typing your code here...`,
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

      if (newLang === "javascript") {
        globalScope.editor.setValue(`// JavaScript Mode\nconsole.log("Hello from JavaScript!");`);
      } else if (newLang === "python") {
        globalScope.editor.setValue(`# Python Mode\nprint("Hello from Python!")`);
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