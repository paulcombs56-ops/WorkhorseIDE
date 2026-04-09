const express = require("express");

const { launchExecutable } = require("../services/launcher");

function createLauncherRouter({ requireApiToken, workspaceRoot, maxExeArgs }) {
  const router = express.Router();

  router.post("/run-executable", requireApiToken, async (req, res) => {
    try {
      const relativePath = String(req.body?.path || "").trim();
      if (!relativePath) {
        return res.status(400).json({ error: "Body field 'path' is required" });
      }

      const result = await launchExecutable(workspaceRoot, relativePath, req.body?.args, maxExeArgs);
      return res.json(result);
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Executable not found" });
      }
      if (
        error.message === "Path escapes workspace root" ||
        error.message === "Path is not a file" ||
        error.message === "Only .exe files can be launched"
      ) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: "Failed to launch executable", details: error.message });
    }
  });

  return router;
}

module.exports = {
  createLauncherRouter,
};