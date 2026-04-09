const express = require("express");

const config = require("./config");
const { createRequireApiToken } = require("./middleware/auth");
const { createCorsMiddleware } = require("./middleware/corsConfig");
const healthRouter = require("./routes/health");
const { createExplorerRouter } = require("./routes/explorer");
const { createLauncherRouter } = require("./routes/launcher");
const formatterRouter = require("./routes/formatter");
const { createExecutorRouter } = require("./routes/executor");
const { createAiRouter } = require("./routes/ai");
const { createProviderAiRouter } = require("./routes/providerAi");
const { createAgentRouter } = require("./routes/agent");
const { createAuthRouter, createTokenService } = require("./routes/auth");
const { createAgentUndoStore } = require("./services/agentUndoStore");
const { createAgentWorkflowService } = require("./services/agentWorkflow");
const { createUserStore } = require("./services/userStore");

const app = express();
const tokenService = createTokenService({
  secret: config.AUTH_JWT_SECRET,
  ttlSeconds: config.AUTH_TOKEN_TTL_SECONDS,
});
const requireApiToken = createRequireApiToken(config.API_AUTH_TOKEN, {
  authMode: config.AUTH_MODE,
  tokenService,
});
const userStore = createUserStore({
  filePath: config.AUTH_USERS_FILE,
});
const undoStore = createAgentUndoStore({
  historyFilePath: config.AGENT_UNDO_HISTORY_FILE,
  maxEntries: config.AGENT_UNDO_HISTORY_LIMIT,
});
const agentWorkflow = createAgentWorkflowService({
  config,
  workspaceRoot: config.WORKSPACE_ROOT,
  undoStore,
});
let serverInstance = null;

app.use(createCorsMiddleware(config.ALLOWED_ORIGINS));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(config.FRONTEND_ROOT));

app.use(healthRouter);
app.use(
  "/api/auth",
  createAuthRouter({
    authMode: config.AUTH_MODE,
    allowRegistration: config.AUTH_ALLOW_REGISTRATION,
    userStore,
    tokenService,
    requireAuth: requireApiToken,
  })
);
app.use(
  createExplorerRouter({
    requireApiToken,
    workspaceRoot: config.WORKSPACE_ROOT,
    maxExplorerDepth: config.MAX_EXPLORER_DEPTH,
    maxFileReadBytes: config.MAX_FILE_READ_BYTES,
  })
);
app.use(
  createLauncherRouter({
    requireApiToken,
    workspaceRoot: config.WORKSPACE_ROOT,
    maxExeArgs: config.MAX_EXE_ARGS,
  })
);
app.use(formatterRouter);
app.use(
  createExecutorRouter({
    sandboxRoot: config.SANDBOX_ROOT,
    execTimeoutMs: config.EXEC_TIMEOUT_MS,
    maxStreamBytes: config.MAX_STREAM_BYTES,
    sandboxPythonCmd: config.SANDBOX_PYTHON_CMD,
    sandboxNodeCmd: config.SANDBOX_NODE_CMD,
  })
);

if (config.ENABLE_LEGACY_AI_PROXY) {
  app.use(
    "/ai",
    createAiRouter(config.AI_BACKEND_URL, {
      deprecationMessage: config.LEGACY_AI_PROXY_DEPRECATION_MESSAGE,
      sunset: config.LEGACY_AI_PROXY_SUNSET,
    })
  );
}

app.use("/api/ai", createProviderAiRouter(config));
app.use(
  "/api/agent",
  createAgentRouter({
    requireApiToken,
    agentWorkflow,
    config,
  })
);

function startServer(port = config.PORT) {
  if (serverInstance) {
    return Promise.resolve(serverInstance);
  }

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      reject(error);
    };

    serverInstance = app.listen(port, () => {
      serverInstance.off("error", onError);
      console.log(`Workhorse backend running on http://localhost:${port}`);
      if (config.ENABLE_LEGACY_AI_PROXY) {
        console.log(
          `Legacy /ai/* proxy is enabled (deprecated, sunset ${config.LEGACY_AI_PROXY_SUNSET}). Use /api/ai.`
        );
      }
      resolve(serverInstance);
    });

    serverInstance.once("error", onError);
  });
}

if (require.main === module) {
  if (config.AUTH_MODE === "user" && !config.AUTH_JWT_SECRET) {
    console.error("WORKHORSE_AUTH_MODE=user requires WORKHORSE_AUTH_JWT_SECRET to be set.");
    process.exit(1);
  }

  if (!config.CLAUDE_API_KEY) {
    console.warn("CLAUDE_API_KEY/ANTHROPIC_API_KEY is not set; Claude provider will be unavailable.");
  }

  startServer().catch((error) => {
    console.error("Failed to start Workhorse backend:", error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
