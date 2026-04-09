const DEFAULT_ALLOWED_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"];

function normalizeModelValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedClaudeModels(config = {}) {
  const configured = Array.isArray(config.CLAUDE_ALLOWED_MODELS) ? config.CLAUDE_ALLOWED_MODELS : [];
  const normalized = configured.map((value) => normalizeModelValue(value)).filter(Boolean);
  const models = normalized.length > 0 ? normalized : DEFAULT_ALLOWED_MODELS;
  return Array.from(new Set(models));
}

function normalizePreferredClaudeModel(value, config = {}) {
  const normalized = normalizeModelValue(value);
  if (!normalized || normalized === "auto") {
    return "auto";
  }

  const allowed = new Set(getAllowedClaudeModels(config));
  if (allowed.has(normalized)) {
    return normalized;
  }
  return null;
}

function computePromptComplexity({ prompt = "", context = "", operationCount = 0 }) {
  const promptText = String(prompt || "").trim();
  const contextText = String(context || "").trim();
  const merged = `${promptText}\n${contextText}`.trim();

  let score = 0;

  if (merged.length > 400) score += 1;
  if (merged.length > 900) score += 2;
  if (merged.length > 1800) score += 2;

  const lineCount = merged ? merged.split(/\r?\n/).length : 0;
  if (lineCount > 20) score += 1;
  if (lineCount > 60) score += 1;

  if (/```|function\s+|class\s+|import\s+|select\s+.+\s+from\s+/i.test(merged)) {
    score += 2;
  }

  if (/refactor|migrate|architecture|multi[-\s]?file|end[-\s]?to[-\s]?end|security|performance|integration/i.test(merged)) {
    score += 2;
  }

  if (/step\s*\d+|first\b|then\b|after that\b|finally\b/i.test(merged)) {
    score += 1;
  }

  if (Number(operationCount) >= 5) score += 1;
  if (Number(operationCount) >= 12) score += 2;

  if (score >= 7) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function getAutoClaudeModelByComplexity(complexity, config = {}) {
  if (complexity === "high") {
    return normalizeModelValue(config.CLAUDE_MODEL_OPUS) || "claude-opus-4-6";
  }
  if (complexity === "low") {
    return normalizeModelValue(config.CLAUDE_MODEL_HAIKU) || "claude-haiku-4-5";
  }
  return normalizeModelValue(config.CLAUDE_MODEL_SONNET) || "claude-sonnet-4-6";
}

function selectClaudeModel({ preferredModel = "auto", prompt = "", context = "", operationCount = 0, config = {} }) {
  const normalizedPreference = normalizePreferredClaudeModel(preferredModel, config);
  const allowed = new Set(getAllowedClaudeModels(config));

  if (normalizedPreference && normalizedPreference !== "auto") {
    return {
      requestedModel: normalizedPreference,
      effectiveModel: normalizedPreference,
      selectionMode: "explicit",
      reason: "user-selected",
      complexity: "n/a",
    };
  }

  const complexity = computePromptComplexity({ prompt, context, operationCount });
  const autoModel = getAutoClaudeModelByComplexity(complexity, config);
  if (allowed.has(autoModel)) {
    return {
      requestedModel: "auto",
      effectiveModel: autoModel,
      selectionMode: "auto",
      reason: `prompt-complexity:${complexity}`,
      complexity,
    };
  }

  const fallback = normalizeModelValue(config.CLAUDE_MODEL) || "claude-sonnet-4-6";
  return {
    requestedModel: "auto",
    effectiveModel: allowed.has(fallback) ? fallback : "claude-sonnet-4-6",
    selectionMode: "fallback",
    reason: "auto-model-not-allowed",
    complexity,
  };
}

module.exports = {
  DEFAULT_ALLOWED_MODELS,
  getAllowedClaudeModels,
  normalizePreferredClaudeModel,
  selectClaudeModel,
};
