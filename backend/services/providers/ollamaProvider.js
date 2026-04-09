const { BaseProvider } = require("./baseProvider");

class OllamaProvider extends BaseProvider {
  constructor({ ollamaUrl, timeoutMs }) {
    super("ollama");
    this.ollamaUrl = String(ollamaUrl || "").replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  isAvailable() {
    return Boolean(this.ollamaUrl);
  }

  async generate({ prompt, model }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = String(data?.response || "").trim();
      if (!text) {
        throw new Error("No response from Ollama");
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = {
  OllamaProvider,
};