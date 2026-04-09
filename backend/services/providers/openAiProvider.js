const { BaseProvider } = require("./baseProvider");

class OpenAiProvider extends BaseProvider {
  constructor({ apiKey, model, timeoutMs }) {
    super("openai");
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async generate({ prompt }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = String(data?.choices?.[0]?.message?.content || "").trim();
      if (!text) {
        throw new Error("No response from OpenAI");
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  OpenAiProvider,
};