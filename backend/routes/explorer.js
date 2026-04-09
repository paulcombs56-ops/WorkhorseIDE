const express = require("express");

const { getWorkspaceTree, getWorkspaceFile } = require("../services/explorer");

function createExplorerRouter({ requireApiToken, workspaceRoot, maxExplorerDepth, maxFileReadBytes }) {
  const router = express.Router();

  router.get("/workspace-tree", requireApiToken, async (req, res) => {
    try {
      const result = await getWorkspaceTree(workspaceRoot, req.query.depth, maxExplorerDepth);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to list workspace tree", details: error.message });
    }
  });

  router.get("/workspace-file", requireApiToken, async (req, res) => {
    try {
      const relativePath = String(req.query.path || "").trim();
      if (!relativePath) {
        return res.status(400).json({ error: "Query parameter 'path' is required" });
      }

      const result = await getWorkspaceFile(workspaceRoot, relativePath, maxFileReadBytes);
      return res.json(result);
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      if (error.message === "Path escapes workspace root" || error.message === "Path is not a file") {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 413) {
        return res.status(413).json({ error: error.message, ...error.extra });
      }

      return res.status(500).json({ error: "Failed to read file", details: error.message });
    }
  });

  return router;
}

module.exports = {
  createExplorerRouter,
};