const express = require("express");

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function createTokenService({ secret, ttlSeconds }) {
  const jwtSecret = String(secret || "").trim();
  const tokenTtl = Math.max(300, Number(ttlSeconds || 86400));

  function sign(payload) {
    if (!jwtSecret) {
      throw new Error("User auth secret is not configured.");
    }

    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const body = {
      ...payload,
      iat: now,
      exp: now + tokenTtl,
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedBody = toBase64Url(JSON.stringify(body));
    const signingInput = `${encodedHeader}.${encodedBody}`;
    const signature = require("crypto").createHmac("sha256", jwtSecret).update(signingInput).digest("base64url");
    return `${signingInput}.${signature}`;
  }

  function verify(token) {
    const source = String(token || "").trim();
    if (!source) {
      return null;
    }

    const parts = source.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedBody, signature] = parts;
    const expected = require("crypto")
      .createHmac("sha256", jwtSecret)
      .update(`${encodedHeader}.${encodedBody}`)
      .digest("base64url");

    if (signature !== expected) {
      return null;
    }

    try {
      const payload = JSON.parse(fromBase64Url(encodedBody));
      const now = Math.floor(Date.now() / 1000);
      if (!payload.exp || now >= Number(payload.exp)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  return {
    sign,
    verify,
  };
}

function createAuthRouter({ authMode, allowRegistration, userStore, tokenService, requireAuth }) {
  const router = express.Router();

  const authDisabled = authMode !== "user";

  router.post("/register", async (req, res) => {
    if (authDisabled) {
      return res.status(400).json({ error: "User auth mode is disabled." });
    }

    if (!allowRegistration) {
      return res.status(403).json({ error: "Registration is disabled." });
    }

    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();

    try {
      const user = await userStore.createUser({ email, password, name });
      const token = tokenService.sign({ sub: user.id, email: user.email, role: user.role });
      return res.status(201).json({ user, token });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Failed to register user." });
    }
  });

  router.post("/login", async (req, res) => {
    if (authDisabled) {
      return res.status(400).json({ error: "User auth mode is disabled." });
    }

    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    const user = await userStore.verifyCredentials({ email, password });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = tokenService.sign({ sub: user.id, email: user.email, role: user.role });
    return res.json({ user, token });
  });

  router.get("/me", requireAuth, async (req, res) => {
    if (authDisabled) {
      return res.status(400).json({ error: "User auth mode is disabled." });
    }

    const userId = String(req.authUser?.sub || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await userStore.getPublicById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user });
  });

  return router;
}

module.exports = {
  createTokenService,
  createAuthRouter,
};
