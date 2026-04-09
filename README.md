# Workhorse IDE 2.0

**A production-ready browser-based code editor with local GPU-accelerated AI, zero cloud dependency, complete privacy.**

![Architecture](https://img.shields.io/badge/Architecture-Local--First-brightgreen)
![GPU Support](https://img.shields.io/badge/GPU-NVIDIA%2F%20AMD%2F%20Ryzen%20AI-blue)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-red)
![License](https://img.shields.io/badge/License-MIT-orange)

## 🎯 Features

### Code Editor
- 📝 **Monaco Editor** - Industry-standard, VS Code quality code editing
- 🎨 **Syntax Highlighting** - JavaScript & Python (extensible)
- ⌨️ **Smart Shortcuts** - Ctrl+Enter to run, arrow keys for history
- 🎭 **Console Themes** - Dark, Neon, Hacker Green

### Code Execution
- ⚡ **JavaScript** - Direct eval in browser
- 🐍 **Python** - Server-side execution with streaming output
- 📊 **Real-time Console** - Timestamped output with color coding

### AI Features (Local GPU-Accelerated)
- 🔍 **Code Analysis** - Find bugs, code smells, issues
- ♻️ **Code Refactoring** - Simplify, extract functions, optimize
- 📚 **Documentation** - Auto-generate docstrings (Google/NumPy/Sphinx)
- 🎯 **Code Completion** - LLM-powered suggestions (extensible)
- ✨ **Code Formatting** - Prettier (JS) + Black (Python)

### Architecture
- **Frontend**: React-ready, Vanilla JS (upgradable)
- **Backend**: Express.js + Python FastAPI
- **AI Engine**: Ollama or vLLM
- **GPU Support**: NVIDIA CUDA, AMD ROCm, Intel Ryzen AI NPU

## 🚀 Quick Start (30 minutes)

The former phone-and-desktop assistant has been extracted into the standalone [pulse-assistant](pulse-assistant) project.

### Prerequisites
- Node.js 18+ 
- Python 3.8+
- 8GB+ VRAM (16GB recommended)
- GPU (NVIDIA RTX 3060+, AMD Radeon RX 5700 XT+, or Ryzen AI)

### Setup

```bash
# 1. Install Ollama
# Download from https://ollama.ai

# 2. Pull a model
ollama pull codellama:7b

# 3. In Terminal 1: Start Ollama
ollama serve

# 4. In Terminal 2: Start Node backend
cd backend
npm install
node app.js

# 5. In Terminal 3: Start Python backend
cd ai_backend
pip install -r requirements.txt
python main.py

# 6. In Terminal 4: Open IDE
# http://localhost:3001/index.html
```

### Verify Setup

```bash
# Run verification script
./verify-services.sh          # Linux/Mac
./verify-services.bat         # Windows
```

Or manually test:
```bash
curl http://localhost:3001/api/hello      # Node backend
curl http://localhost:8888/health         # Python backend
curl http://localhost:11434/api/tags      # Ollama
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[QUICKSTART.md](QUICKSTART.md)** | Step-by-step setup + 6 workflow examples |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture + checklist + verification |
| **[AI_INTEGRATION.md](AI_INTEGRATION.md)** | What's new + how to use AI features |
| **[ai_backend/README.md](ai_backend/README.md)** | API reference + troubleshooting |
| **[ai_backend/SETUP.md](ai_backend/SETUP.md)** | GPU optimization for NVIDIA/AMD/Ryzen AI |

## 🎮 Using the IDE

### Buttons
| Button | Shortcut | Purpose |
|--------|----------|---------|
| **⚡ Run** | Ctrl+Enter | Execute JS/Python |
| **✨ Format** | - | Auto-format code |
| **🔍 Analyze** | - | Find issues (AI) |
| **♻️ Refactor** | - | Improve code (AI) |
| **📚 Generate Docs** | - | Add docstrings (AI) |
| **🤖 AI Status** | - | Check AI backend |

### Example: Analyze Python Code

```python
# Write in editor
def buggy_code():
    x = 10
    print(undefined_var)  # Oops!
    return result        # Result not defined

# Click "🔍 Analyze"
# Output: Shows undefined variables and issues
```

### Example: Refactor JavaScript

```javascript
// Write in editor
if (x === true) {
    console.log("ok");
}

// Click "♻️ Refactor" → choose "simplify"
// Output: 
if (x) {
    console.log("ok");
}
```

## 📁 Project Structure

```
Workhorse 2.0/
├── frontend/                  # Browser IDE
│   ├── index.html
│   ├── main.js               # Thin bootstrap/orchestration
│   ├── aiService.js          # AI API client + chat transport
│   ├── chatModule.js
│   ├── chatRenderModule.js
│   ├── aiFeaturesModule.js
│   ├── consoleModule.js
│   ├── editorModule.js
│   ├── executionModule.js
│   ├── explorerModule.js
│   ├── panelResizerModule.js
│   └── styles.css
├── backend/                   # Node.js server
│   ├── app.js                # Express route composition
│   ├── routes/               # health/explorer/exec/ai/providerAi
│   ├── services/             # formatter/executor/providers/chain
│   ├── middleware/
│   ├── utils/
│   └── config.js
│   └── package.json
├── ai_backend/               # Python AI server
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── README.md
│   └── SETUP.md
├── QUICKSTART.md             # ← Read this first!
├── ARCHITECTURE.md
├── AI_INTEGRATION.md
├── verify-services.sh        # Test everything works
└── verify-services.bat       # Windows version
```

## 🛠️ API Endpoints

Node backend runs on `http://localhost:3001`.

Legacy AI proxy (deprecated, still available by default):

```bash
GET /ai/health
POST /ai/analyze
POST /ai/refactor
POST /ai/generate-docs
POST /ai/complete
GET /ai/models
```

Provider chain route (new):

```bash
GET /api/ai/health
POST /api/ai
Body: {prompt, model?}
→ {response, source, model, ...}
```

Legacy route details:

```bash
# Health check
GET /health
→ {status, provider, model}

# Analyze code
POST /analyze
Body: {code, language}
→ {issues[], suggestions[]}

# Refactor code  
POST /refactor
Body: {code, language, refactor_type}
→ {refactored_code, explanation}

# Generate documentation
POST /generate-docs
Body: {code, language, style}
→ {documentation}

# Code completion
POST /complete
Body: {code, language, cursor_position, context_lines}
→ {completion, confidence}

# List models
GET /models
→ {provider, models[]}
```

## ⚙️ Configuration

Edit `ai_backend/.env`:

```bash
# AI provider: "ollama" or "vllm"
AI_PROVIDER=ollama

# Ollama URL
OLLAMA_URL=http://localhost:11434

# Default model
DEFAULT_MODEL=codellama:7b

# Backend port
AI_BACKEND_PORT=8888
```

Backend security (optional) is configured via environment variables when starting `backend/app.js`:

```bash
# Backend HTTP port
PORT=3001

# Comma-separated CORS allowlist
ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001

# Optional API token to protect sensitive routes
WORKHORSE_API_TOKEN=replace-with-a-strong-token

# Legacy /ai/* compatibility proxy (deprecated)
ENABLE_LEGACY_AI_PROXY=true
LEGACY_AI_PROXY_SUNSET=2026-07-31

# Provider-chain default model
WORKHORSE_DEFAULT_CHAT_MODEL=llama3
```

When `WORKHORSE_API_TOKEN` is set, the frontend should provide the same token in browser local storage:

```javascript
localStorage.setItem("workhorse-api-token", "replace-with-a-strong-token");
```

### Use Your Own Anthropic Key (Claude)

1. Open the IDE and set chat `Route` to `Provider`.
2. Set `Provider` to `Claude` (or keep `Auto` to allow fallback).
3. Paste your key into `Anthropic API key` and click `Save Key`.

The key is stored only in your browser local storage and is sent as `x-anthropic-api-key` to the local Node backend.

## 🎓 Supported Models

| Model | VRAM | Speed | Quality | Command |
|-------|------|-------|---------|---------|
| **CodeLlama 7B** | ~5GB | Fast | Excellent | `ollama pull codellama:7b` |
| CodeLlama 13B | ~12GB | Medium | Better | `ollama pull codellama:13b` |
| Mistral 7B | ~5GB | Fast | Good | `ollama pull mistral:7b` |
| Neural Chat 7B | ~5GB | Fast | Good | `ollama pull neural-chat:7b` |
| CodeLlama 7B (Q4) | ~3GB | Fast | Decent | `ollama pull codellama:7b-q4` |

**Recommended:** CodeLlama 7B for most users

## 🚦 Performance

| GPU | Model | Latency |
|-----|-------|---------|
| RTX 4090 | CodeLlama 7B | <1s |
| RTX 4070 | CodeLlama 7B | 2-4s |
| RTX 4060 | CodeLlama 7B | 4-8s |
| RTX 3060 12GB | Mistral 7B | 5-10s |
| **Recommended Setup** | CodeLlama 7B | **4-8s** |

## 🔒 Privacy & Security

✅ **Local-First** - Core IDE and local model flow stay on your machine
✅ **Optional Cloud Providers** - Claude/Groq/OpenAI can be enabled by your keys
✅ **No Tracking** - No telemetry or logging
✅ **Open Source** - Inspect & modify the code
✅ **Provider Choice** - Use local-only or hybrid fallback as needed

## 🐛 Troubleshooting

### AI Features Show "Offline"
```bash
# Ensure all 3 services are running:
ollama serve                    # Terminal 1
cd backend && node app.js       # Terminal 2  
cd ai_backend && python main.py # Terminal 3
```

### Slow AI Responses (>10 seconds)
```bash
# Check GPU usage
nvidia-smi -l 1

# Reduce model size
ollama pull mistral:7b
# or quantized
ollama pull codellama:7b-q4
```

### Out of Memory
```bash
# Use quantized version (-q4, -q5)
ollama pull codellama:7b-q4

# Or smaller model
ollama pull neural-chat:7b
```

### Port Already in Use
```bash
# Find & kill process on port
lsof -i :3001                           # Mac/Linux
netstat -ano | findstr :3001            # Windows
kill <PID>                              # Mac/Linux
taskkill /PID <PID> /F                  # Windows
```

See [QUICKSTART.md](QUICKSTART.md#troubleshooting-ai-features) for detailed troubleshooting.

## 🔄 Workflow Examples

### Example 1: Clean & Document Code
```
Write code → ✨ Format → 🔍 Analyze → 📚 Generate Docs
```

### Example 2: Optimize Function
```
Write slow function → 🔍 Analyze → ♻️ Refactor (optimize) → ⚡ Run to verify
```

### Example 3: Debug Code
```
Run code (⚡) → See error → 🔍 Analyze → Fix → ⚡ Run again
```

## 📈 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Monaco Editor, Vanilla JS | Code editing & UI |
| **Backend** | Express.js | HTTP server + proxy |
| **AI** | FastAPI (Python) | AI service endpoints |
| **Inference** | Ollama / vLLM | Local LLM serving |
| **GPU** | CUDA / ROCm / Ryzen AI | Hardware acceleration |

## 🎯 Next Steps

1. ✅ **Run Setup** - Follow [QUICKSTART.md](QUICKSTART.md)
2. 🧪 **Test Services** - Run `verify-services.sh` (or `.bat` on Windows)
3. 💡 **Try Features** - Click all AI buttons
4. ⚡ **Optimize** - Read [ai_backend/SETUP.md](ai_backend/SETUP.md) for GPU tuning
5. 🚀 **Deploy** - Run as background service (systemd, Docker, etc.)

## 🤝 Contributing

Contributions welcome! Areas for enhancement:
- Real-time code completion as-you-type
- Streaming responses from AI backend
- Model switcher UI
- Project-wide code analysis
- Keyboard shortcuts for AI features
- Dark mode improvements

## 📝 License

MIT - Use freely in personal & commercial projects

## 🆘 Support

- 📖 Read [QUICKSTART.md](QUICKSTART.md) for setup help
- 🏗️ Check [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
- ✅ Use [docs/FRONTEND_REGRESSION_CHECKLIST.md](docs/FRONTEND_REGRESSION_CHECKLIST.md) after frontend changes
- 🔧 See [ai_backend/SETUP.md](ai_backend/SETUP.md) for GPU troubleshooting
- 🤖 See [ai_backend/README.md](ai_backend/README.md) for API reference

## 💡 FAQ

**Q: Does this send my code to the cloud?**
A: No. Everything runs locally. No data leaves your machine.

**Q: What GPUs are supported?**
A: NVIDIA (CUDA 12.x), AMD (ROCm), Intel Ryzen AI NPU. Check [ai_backend/SETUP.md](ai_backend/SETUP.md).

**Q: Can I use this without a GPU?**
A: Not recommended - CPU inference is 100x slower. GPUs are essential.

**Q: What models can I use?**
A: Any model available in Ollama. CodeLlama 7B recommended for code tasks.

**Q: Why is it slow the first time?**
A: Model is loading from disk to VRAM. Subsequent calls are much faster.

**Q: Can I add new AI features?**
A: Yes. Add backend endpoints and wire UI handlers in the relevant frontend modules (for example `aiFeaturesModule.js` and `chatModule.js`), keeping `main.js` as bootstrap-only orchestration.

**Q: How do I switch models?**
A: `ollama pull mistral:7b`, then set `DEFAULT_MODEL=mistral:7b` in `.env`.

---

## 🎉 Ready to Code?

```bash
# 1. Follow QUICKSTART.md
# 2. Run verify-services.sh/bat
# 3. Open http://localhost:3001/index.html
# 4. Click 🤖 AI Status to verify
# 5. Start coding!
```

**Enjoy your local, private, GPU-accelerated IDE!** 🚀
