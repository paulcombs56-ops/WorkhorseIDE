const { OllamaProvider } = require("./providers/ollamaProvider");
const { ClaudeProvider } = require("./providers/claudeProvider");
const { GroqProvider } = require("./providers/groqProvider");
const { OpenAiProvider } = require("./providers/openAiProvider");

function normalizeProviderName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function createProviderMap(config) {
  return {
    ollama: new OllamaProvider({
      ollamaUrl: config.OLLAMA_URL,
      timeoutMs: config.AI_PROVIDER_TIMEOUT_MS,
    }),
    claude: new ClaudeProvider({
      apiKey: config.CLAUDE_API_KEY,
      model: config.CLAUDE_MODEL,
      timeoutMs: config.AI_PROVIDER_TIMEOUT_MS,
    }),
    groq: new GroqProvider({
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_MODEL,
      timeoutMs: config.AI_PROVIDER_TIMEOUT_MS,
    }),
    openai: new OpenAiProvider({
      apiKey: config.OPENAI_API_KEY,
      model: config.OPENAI_MODEL,
      timeoutMs: config.AI_PROVIDER_TIMEOUT_MS,
    }),
  };
}

function buildProviderChain(config, options = {}) {
  const preferredProvider = normalizeProviderName(options.preferredProvider);
  const providersByName = createProviderMap(config);
  const orderedNames = Array.isArray(config.AI_PROVIDER_CHAIN) ? config.AI_PROVIDER_CHAIN : [];
  const chain = [];

  for (const name of orderedNames) {
    const provider = providersByName[name];
    if (provider) {
      chain.push(provider);
    }
  }

  if (chain.length === 0) {
    chain.push(providersByName.ollama, providersByName.claude, providersByName.groq, providersByName.openai);
  }

  if (preferredProvider) {
    const preferred = providersByName[preferredProvider];
    if (preferred) {
      const withoutPreferred = chain.filter((provider) => provider.name !== preferredProvider);
      return [preferred, ...withoutPreferred];
    }
  }

  return chain;
}

function resolveModelForProvider(providerName, requestedModel, config) {
  const provider = normalizeProviderName(providerName);
  const model = String(requestedModel || "").trim();

  if (provider === "claude") {
    return model.toLowerCase().startsWith("claude-") ? model : config.CLAUDE_MODEL;
  }

  if (provider === "ollama") {
    return model && !model.toLowerCase().startsWith("claude-") ? model : config.DEFAULT_CHAT_MODEL;
  }

  return model || config.DEFAULT_CHAT_MODEL;
}

async function runProviderChain(config, { prompt, model, preferredProvider }) {
  const chain = buildProviderChain(config, { preferredProvider });
  const failures = [];

  for (const provider of chain) {
    if (!provider?.isAvailable?.()) {
      failures.push({ provider: provider?.name || "unknown", reason: "not-configured" });
      continue;
    }

    try {
      const providerModel = resolveModelForProvider(provider.name, model, config);
      const response = await provider.generate({ prompt, model: providerModel });
      return {
        source: provider.name,
        response,
      };
    } catch (error) {
      failures.push({ provider: provider.name, reason: error.message });
    }
  }

  const error = new Error("All AI providers failed.");
  error.failures = failures;
  throw error;
}

function getProviderStatus(config) {
  return buildProviderChain(config).map((provider) => ({
    name: provider.name,
    available: provider.isAvailable(),
  }));
}

module.exports = {
  runProviderChain,
  getProviderStatus,
};