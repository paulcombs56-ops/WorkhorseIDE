const express = require("express");

const { runProviderChain, getProviderStatus } = require("../services/aiProviderChain");

function createProviderAiRouter(config) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    const providers = getProviderStatus(config);
    const hasAny = providers.some((provider) => provider.available);
    return res.json({
      status: hasAny ? "ok" : "degraded",
      default_model: config.DEFAULT_CHAT_MODEL,
      providers,
    });
  });

  router.post("/", async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const model = String(req.body?.model || "").trim() || config.DEFAULT_CHAT_MODEL;
    const preferredProvider = String(req.body?.preferred_provider || "").trim().toLowerCase();

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    try {
      const result = await runProviderChain(config, {
        prompt,
        model,
        preferredProvider,
      });
      return res.json(result);
    } catch (error) {
      return res.status(503).json({
        error: error.message,
        failures: Array.isArray(error.failures) ? error.failures : [],
      });
    }
  });

  return router;
}

module.exports = {
  createProviderAiRouter,
};