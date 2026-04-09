const express = require("express");
const { normalizePreferredClaudeModel } = require("../services/agentModelSelector");

function createAgentRouter({ requireApiToken, agentWorkflow, config }) {
  const router = express.Router();

  function normalizePreferredModel(value) {
    return normalizePreferredClaudeModel(value, config);
  }

  function normalizeMode(value, defaultMode = "continue") {
    const normalized = String(value || defaultMode).trim().toLowerCase();
    return normalized === "stop_on_error" ? "stop_on_error" : "continue";
  }

  function validateForgeRequest(body, limits = {}) {
    const maxOperations = Number(limits.maxOperations || 100);
    const maxContentBytes = Number(limits.maxContentBytes || 500000);
    const operations = Array.isArray(body?.operations) ? body.operations : [];

    if (operations.length === 0) {
      return { ok: false, error: "operations must be a non-empty array." };
    }
    if (operations.length > maxOperations) {
      return { ok: false, error: `operations exceeds limit (${maxOperations}).` };
    }

    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index] || {};
      const op = String(operation.op || "").trim().toLowerCase();
      if (!["create", "edit", "delete", "rename"].includes(op)) {
        return { ok: false, error: `operations[${index}].op is invalid.` };
      }

      const path = String(operation.path || "").trim();
      if (!path) {
        return { ok: false, error: `operations[${index}].path is required.` };
      }

      if (op === "rename") {
        const newPath = String(operation.newPath || "").trim();
        if (!newPath) {
          return { ok: false, error: `operations[${index}].newPath is required for rename.` };
        }
      }

      if (op === "create" || op === "edit") {
        if (typeof operation.content !== "string") {
          return { ok: false, error: `operations[${index}].content must be a string for ${op}.` };
        }

        if (Buffer.byteLength(operation.content, "utf8") > maxContentBytes) {
          return {
            ok: false,
            error: `operations[${index}].content exceeds max bytes (${maxContentBytes}).`,
          };
        }
      }
    }

    return { ok: true };
  }

  router.post("/consult", requireApiToken, async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const context = String(req.body?.context || "");
    const contextChips = Array.isArray(req.body?.context) ? req.body.context : [];
    const preferredProvider = String(req.body?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.body?.preferred_model);

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    try {
      const result = await agentWorkflow.consult({
        prompt,
        context,
        contextChips,
        preferredProvider,
        preferredModel,
      });
      return res.json(result);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  });

  router.post("/blueprint", requireApiToken, async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const context = String(req.body?.context || "");
    const contextChips = Array.isArray(req.body?.context) ? req.body.context : [];
    const preferredProvider = String(req.body?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.body?.preferred_model);

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    try {
      const result = await agentWorkflow.blueprint({
        prompt,
        context,
        contextChips,
        preferredProvider,
        preferredModel,
      });
      return res.json(result);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  });

  router.post("/forge", requireApiToken, async (req, res) => {
    const summary = String(req.body?.summary || "");
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    const mode = "stop_on_error";
    const allowHighRisk = Boolean(req.body?.allow_high_risk);
    const preferredProvider = String(req.body?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.body?.preferred_model);

    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    const validation = validateForgeRequest(req.body, {
      maxOperations: config?.AGENT_FORGE_MAX_OPERATIONS,
      maxContentBytes: config?.AGENT_FORGE_MAX_CONTENT_BYTES,
    });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const result = await agentWorkflow.forge({
        summary,
        operations,
        mode,
        allowHighRisk,
        preferredModel,
        preferredProvider,
      });
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.post("/undo", requireApiToken, async (req, res) => {
    const undoId = String(req.body?.undoId || "").trim();
    const preferredProvider = String(req.body?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.body?.preferred_model);
    if (!undoId) {
      return res.status(400).json({ error: "undoId is required." });
    }

    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    try {
      const result = await agentWorkflow.undo({ undoId, preferredModel, preferredProvider });
      if (!result.success) {
        return res.status(404).json(result);
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/undo/history", requireApiToken, async (req, res) => {
    const preferredProvider = String(req.query?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.query?.preferred_model);
    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    try {
      const result = await agentWorkflow.listUndoHistory({ preferredModel, preferredProvider });
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/search", requireApiToken, async (req, res) => {
    const query = String(req.query?.q || "").trim();
    const preferredProvider = String(req.query?.preferred_provider || "").trim().toLowerCase();
    const preferredModel = normalizePreferredModel(req.query?.preferred_model);
    if (!query) {
      return res.status(400).json({ error: "Query parameter q is required." });
    }

    if (!preferredModel) {
      return res.status(400).json({ error: "preferred_model must be auto or a supported Claude model." });
    }

    try {
      const result = await agentWorkflow.search({ query, preferredModel, preferredProvider });
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createAgentRouter,
};
