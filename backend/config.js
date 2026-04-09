const path = require("path");

const PORT = Number(process.env.PORT || 3001);
const API_AUTH_TOKEN = String(process.env.WORKHORSE_API_TOKEN || "").trim();
const parseBoolean = (value, defaultValue) => {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || "http://localhost:3001,http://127.0.0.1:3001")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const CLAUDE_MODEL_OPUS = String(process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-6").trim().toLowerCase();
const CLAUDE_MODEL_SONNET = String(process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6").trim().toLowerCase();
const CLAUDE_MODEL_HAIKU = String(process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5").trim().toLowerCase();
const CLAUDE_ALLOWED_MODELS = Array.from(
  new Set(
    String(
      process.env.CLAUDE_ALLOWED_MODELS || [CLAUDE_MODEL_OPUS, CLAUDE_MODEL_SONNET, CLAUDE_MODEL_HAIKU].join(",")
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  )
);

module.exports = {
  PORT,
  API_AUTH_TOKEN,
  AUTH_MODE: String(process.env.WORKHORSE_AUTH_MODE || "legacy").trim().toLowerCase() === "user" ? "user" : "legacy",
  AUTH_JWT_SECRET: String(process.env.WORKHORSE_AUTH_JWT_SECRET || "").trim(),
  AUTH_TOKEN_TTL_SECONDS: Math.max(300, Number(process.env.WORKHORSE_AUTH_TOKEN_TTL_SECONDS || 86400)),
  AUTH_ALLOW_REGISTRATION: parseBoolean(process.env.WORKHORSE_AUTH_ALLOW_REGISTRATION, true),
  AUTH_USERS_FILE:
    process.env.WORKHORSE_AUTH_USERS_FILE ||
    path.resolve(process.env.WORKSPACE_ROOT || path.resolve(__dirname, ".."), ".workhorse", "users.json"),
  ALLOWED_ORIGINS,
  FRONTEND_ROOT: path.resolve(__dirname, "..", "frontend"),
  SANDBOX_ROOT: path.resolve(__dirname, "..", "sandbox", "runs"),
  WORKSPACE_ROOT: path.resolve(process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..")),
  EXEC_TIMEOUT_MS: Number(process.env.SANDBOX_TIMEOUT_MS || 12000),
  MAX_STREAM_BYTES: Number(process.env.SANDBOX_MAX_OUTPUT_BYTES || 120000),
  MAX_EXPLORER_DEPTH: Number(process.env.EXPLORER_MAX_DEPTH || 4),
  MAX_FILE_READ_BYTES: Number(process.env.EXPLORER_MAX_FILE_BYTES || 300000),
  MAX_EXE_ARGS: Number(process.env.RUN_EXE_MAX_ARGS || 12),
  AI_BACKEND_URL: process.env.AI_BACKEND_URL || "http://localhost:8888",
  ENABLE_LEGACY_AI_PROXY: parseBoolean(process.env.ENABLE_LEGACY_AI_PROXY, true),
  LEGACY_AI_PROXY_SUNSET: process.env.LEGACY_AI_PROXY_SUNSET || "2026-07-31",
  LEGACY_AI_PROXY_DEPRECATION_MESSAGE:
    process.env.LEGACY_AI_PROXY_DEPRECATION_MESSAGE || "Legacy /ai/* route is deprecated; use /api/ai.",
  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
  DEFAULT_CHAT_MODEL: process.env.WORKHORSE_DEFAULT_CHAT_MODEL || "llama3",
  AI_PROVIDER_CHAIN: String(process.env.WORKHORSE_AI_PROVIDER_CHAIN || "ollama,claude,groq,openai")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  CLAUDE_API_KEY: String(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim(),
  CLAUDE_MODEL_OPUS,
  CLAUDE_MODEL_SONNET,
  CLAUDE_MODEL_HAIKU,
  CLAUDE_ALLOWED_MODELS,
  CLAUDE_MODEL: String(process.env.CLAUDE_MODEL || CLAUDE_MODEL_SONNET).trim().toLowerCase(),
  GROQ_API_KEY: String(process.env.GROQ_API_KEY || "").trim(),
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
  OPENAI_API_KEY: String(process.env.OPENAI_API_KEY || "").trim(),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  AI_PROVIDER_TIMEOUT_MS: Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000),
  AGENT_UNDO_HISTORY_FILE:
    process.env.AGENT_UNDO_HISTORY_FILE || path.resolve(process.env.WORKSPACE_ROOT || path.resolve(__dirname, ".."), ".workhorse", "agent-undo-history.json"),
  AGENT_UNDO_HISTORY_LIMIT: Number(process.env.AGENT_UNDO_HISTORY_LIMIT || 20),
  AGENT_BLUEPRINT_MAX_ATTEMPTS: Number(process.env.AGENT_BLUEPRINT_MAX_ATTEMPTS || 2),
  AGENT_FORGE_MAX_OPERATIONS: Number(process.env.AGENT_FORGE_MAX_OPERATIONS || 100),
  AGENT_FORGE_MAX_CONTENT_BYTES: Number(process.env.AGENT_FORGE_MAX_CONTENT_BYTES || 500000),
  AGENT_FORGE_DEFAULT_MODE: String(process.env.AGENT_FORGE_DEFAULT_MODE || "continue").trim().toLowerCase(),
  AGENT_ALLOW_HIGH_RISK_DEFAULT: parseBoolean(process.env.AGENT_ALLOW_HIGH_RISK_DEFAULT, false),
  AGENT_SEARCH_MAX_RESULTS: Number(process.env.AGENT_SEARCH_MAX_RESULTS || 40),
  AGENT_SEARCH_MAX_FILE_BYTES: Number(process.env.AGENT_SEARCH_MAX_FILE_BYTES || 200000),
  SANDBOX_PYTHON_CMD: process.env.SANDBOX_PYTHON_CMD || "python.exe",
  SANDBOX_NODE_CMD: process.env.SANDBOX_NODE_CMD || "node",
  AGENT_CONTEXT_MAX_TOTAL_BYTES: Number(process.env.AGENT_CONTEXT_MAX_TOTAL_BYTES || 500000),
  AGENT_CONTEXT_MAX_FILES: Number(process.env.AGENT_CONTEXT_MAX_FILES || 10),
};