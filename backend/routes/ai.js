const express = require("express");
const httpProxy = require("express-http-proxy");

function createAiRouter(aiBackendUrl, options = {}) {
  const router = express.Router();

  const deprecationMessage = String(options.deprecationMessage || "Legacy /ai/* route is deprecated; use /api/ai.");
  const sunset = String(options.sunset || "2026-07-31");

  router.use(
    "/",
    httpProxy(aiBackendUrl, {
      proxyReqPathResolver: (req) => req.originalUrl.replace(/^\/ai/, ""),
      userResHeaderDecorator: (headers) => ({
        ...headers,
        Deprecation: "true",
        Sunset: sunset,
        Link: '</api/ai>; rel="successor-version"',
        Warning: `299 workhorse "${deprecationMessage}"`,
      }),
      proxyErrorHandler: (err, res) => {
        console.error("AI backend error:", err.message);
        res.status(503).json({
          error: "AI backend unavailable. Ensure Python backend is running on port 8888.",
          details: err.message,
        });
      },
    })
  );

  return router;
}

module.exports = {
  createAiRouter,
};