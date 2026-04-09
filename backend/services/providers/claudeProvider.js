const { BaseProvider } = require("./baseProvider");

class ClaudeProvider extends BaseProvider {
  constructor({ apiKey, model, timeoutMs }) {
    super("claude");
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async generate({ prompt, model }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: String(model || this.model || "").trim() || this.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = String(data?.content?.[0]?.text || "").trim();
      if (!text) {
        throw new Error("No response from Claude");
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  ClaudeProvider,
};