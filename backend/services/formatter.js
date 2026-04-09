const { spawn } = require("child_process");
const prettier = require("prettier");

async function formatCode(code, language) {
  if (language === "javascript") {
    const formatted = await prettier.format(code, { parser: "babel" });
    return { formatted };
  }

  if (language === "python") {
    return new Promise((resolve, reject) => {
      const py = spawn("python.exe", ["-m", "black", "-"]);
      let output = "";
      let error = "";

      py.stdout.on("data", (data) => {
        output += data.toString();
      });

      py.stderr.on("data", (data) => {
        error += data.toString();
      });

      py.on("close", (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(error || "Black formatting failed"));
          return;
        }

        resolve({ formatted: output });
      });

      py.stdin.write(code);
      py.stdin.end();
    });
  }

  throw new Error("Unsupported language");
}

module.exports = {
  formatCode,
};