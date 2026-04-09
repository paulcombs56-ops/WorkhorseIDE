const express = require("express");

const { runCodeInSandbox } = require("../services/executor");
const { writeSse } = require("../utils/sse");

function createExecutorRouter({ sandboxRoot, execTimeoutMs, maxStreamBytes, sandboxPythonCmd, sandboxNodeCmd }) {
  const router = express.Router();

  router.get("/run-python-stream", async (req, res) => {
    const code = String(req.query.code || "");
    if (!code.trim()) {
      return res.status(400).json({ error: "No code provided" });
    }

    try {
      await runCodeInSandbox({
        res,
        code,
        fileName: "main.py",
        command: sandboxPythonCmd,
        args: ["main.py"],
        sandboxRoot,
        execTimeoutMs,
        maxStreamBytes,
      });
    } catch (error) {
      console.error("Python sandbox error:", error.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Sandbox execution failed", details: error.message });
      }
      writeSse(res, `ERROR: Sandbox execution failed: ${error.message}`);
      writeSse(res, "__END__");
      return res.end();
    }
  });

  router.get("/run-js-stream", async (req, res) => {
    const code = String(req.query.code || "");
    if (!code.trim()) {
      return res.status(400).json({ error: "No code provided" });
    }

    try {
      await runCodeInSandbox({
        res,
        code,
        fileName: "main.js",
        command: sandboxNodeCmd,
        args: ["main.js"],
        sandboxRoot,
        execTimeoutMs,
        maxStreamBytes,
      });
    } catch (error) {
      console.error("JavaScript sandbox error:", error.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Sandbox execution failed", details: error.message });
      }
      writeSse(res, `ERROR: Sandbox execution failed: ${error.message}`);
      writeSse(res, "__END__");
      return res.end();
    }
  });

  return router;
}

module.exports = {
  createExecutorRouter,
};