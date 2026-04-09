function parseBearerToken(req) {
  const authHeader = String(req.get("authorization") || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

function createRequireApiToken(apiAuthToken, options = {}) {
  const authMode = String(options.authMode || "legacy").trim().toLowerCase();
  const tokenService = options.tokenService;

  return function requireApiToken(req, res, next) {
    if (authMode === "user") {
      if (!tokenService || typeof tokenService.verify !== "function") {
        return res.status(500).json({ error: "Auth service not configured." });
      }

      const bearer = parseBearerToken(req);
      const payload = tokenService.verify(bearer);
      if (!payload) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      req.authUser = payload;
      return next();
    }

    if (!apiAuthToken) {
      return next();
    }

    const tokenFromHeader = String(req.get("x-workhorse-token") || "").trim();
    if (tokenFromHeader && tokenFromHeader === apiAuthToken) {
      return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
  };
}

module.exports = {
  parseBearerToken,
  createRequireApiToken,
};