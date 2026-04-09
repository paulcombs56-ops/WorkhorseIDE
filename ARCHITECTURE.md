# Workhorse IDE - Architecture & Setup Checklist

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      WORKHORSE IDE                           │
│                  (localhost:3000/5173)                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  FRONTEND (Browser)                                    │  │
│  │  • Monaco Editor (JavaScript + Python highlighting)   │  │
│  │  • Console with timestamps & themes                   │  │
│  │  • AI Feature Buttons (Analyze, Refactor, Docs)      │  │
│  │  • Code execution controls                            │  │
│  │                                                        │  │
│  │  main.js: bootstrap + module wiring                  │  │
│  │  Modules: chat/render/editor/execution/explorer      │  │
│  └────────────────────────────────────────────────────────┘  │
│                          ▲                                    │
│                          │ HTTP                               │
│                          ▼                                    │
│       /ai/* (legacy proxy) + /api/ai (provider chain)       │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ http://localhost:3001
                           ▼
┌──────────────────────────────────────────────────────────────┐
│               NODE.JS BACKEND (Express)                      │
│                 (localhost:3001)                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Express Routes:                                       │  │
│  │  • GET /api/hello                                     │  │
│  │  • POST /format-code (Prettier + Black)              │  │
│  │  • GET /run-python-stream (SSE for Python execution)│  │
│  │  • ALL /ai/* → legacy proxy (deprecated)             │  │
│  │  • GET /api/ai/health                                │  │
│  │  • POST /api/ai (provider fallback chain)            │  │
│  │                                                        │  │
│  │  modular routes/services/middleware                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                          ▲                                    │
│                          │ HTTP                               │
│                          ▼                                    │
│              /ai* requests routed                            │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ http://localhost:8888
                           ▼
┌──────────────────────────────────────────────────────────────┐
│            PYTHON AI BACKEND (FastAPI)                       │
│                 (localhost:8888)                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AI Service Endpoints:                                 │  │
│  │  • GET /health → Check backend status                │  │
│  │  • POST /complete → Code completion                  │  │
│  │  • POST /analyze → Find issues & bugs                │  │
│  │  • POST /refactor → Simplify/optimize code           │  │
│  │  • POST /generate-docs → Auto docstrings            │  │
│  │  • GET /models → List available models               │  │
│  │                                                        │  │
│  │  Uses httpx (async) to call Ollama/vLLM            │  │
│  └────────────────────────────────────────────────────────┘  │
│                          ▲                                    │
│                          │ REST API                           │
│                          ▼                                    │
│              LLM inference requests                          │
└──────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                      │
    Config:                               Config:
 OLLAMA_URL=                          VLLM_URL=
localhost:11434                      localhost:8000
        │                                      │
        ▼                                      ▼
┌─────────────────────┐          ┌─────────────────────┐
│   OLLAMA ENGINE     │          │   vLLM ENGINE       │
│  (localhost:11434)  │          │  (localhost:8000)   │
│                     │          │                     │
│ • Runs LLM models   │          │ • Fast inference    │
│ • GPU accelerated   │          │ • Tensor parallel   │
│ • Model management  │          │ • Advanced serving  │
└──────────┬──────────┘          └──────────┬──────────┘
           │                                 │
           │ Default Option          Alternate Option
           │ (Recommended)           (For power users)
           │                                 │
           └─────────┬─────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  GPU / NPU             │
        │  • NVIDIA CUDA 12.x    │
        │  • AMD ROCm            │
        │  • Intel Ryzen AI NPU  │
        │                        │
        │  LLM Models:           │
        │  • CodeLlama 7B (5GB)  │
        │  • Mistral 7B (5GB)    │
        │  • Neural Chat 7B (5GB)│
        └────────────────────────┘
```

## Service Startup Flow

```
Terminal 1: Start Ollama
$ ollama serve
✓ Started listening on 127.0.0.1:11434

Terminal 2: Start Node Backend
$ cd backend && npm install  # First time only
$ node app.js
✓ Server running on http://localhost:3001

Terminal 3: Start Python AI Backend
$ cd ai_backend && pip install -r requirements.txt  # First time
$ python main.py
INFO: Uvicorn running on http://0.0.0.0:8888

Terminal 4: Open Browser
$ http://localhost:3000  (or :5173 if Vite)
```

## Complete Setup Checklist

### Prerequisites
- [ ] Windows/Mac/Linux system
- [ ] NVIDIA GPU (RTX 3060+) OR AMD GPU OR Ryzen AI NPU
- [ ] 8GB+ VRAM (16GB recommended)
- [ ] Node.js v18+ installed (`node --version`)
- [ ] Python 3.8+ installed (`python --version`)
- [ ] 6GB+ free disk space (for model download)

### Phase 1: Ollama Setup (10 minutes)

- [ ] Download Ollama from https://ollama.ai
- [ ] Install Ollama for your OS
- [ ] Verify: `ollama --version` → should show version number
- [ ] Pull model: `ollama pull codellama:7b` (download ~5GB)
  - OR alternative: `ollama pull mistral:7b`
  - OR small: `ollama pull neural-chat:7b`
- [ ] Test: `ollama list` → should show downloaded models
- [ ] Start Ollama: `ollama serve` (leave running in Terminal 1)
- [ ] Verify GPU: `nvidia-smi` → GPU should show in use after pull command

### Phase 2: Node Backend Setup (5 minutes)

- [ ] Navigate: `cd backend`
- [ ] Install: `npm install` (adds express-http-proxy)
- [ ] Verify: `npm list` → should show dependencies
- [ ] Start: `node app.js` (leaves running in Terminal 2)
- [ ] Check output: Should see "Server running on http://localhost:3001"

### Phase 3: Python AI Backend Setup (5 minutes)

- [ ] Navigate: `cd ai_backend`
- [ ] Create config: Copy `.env.example` to `.env` (optional, has defaults)
- [ ] Install: `pip install -r requirements.txt`
- [ ] Verify: `pip list` → should show fastapi, uvicorn, httpx, pydantic, python-dotenv
- [ ] Start: `python main.py` (leaves running in Terminal 3)
- [ ] Check output: Should see "Uvicorn running on http://0.0.0.0:8888"

### Phase 4: IDE Verification (5 minutes)

- [ ] Open browser: http://localhost:3000 (or :5173)
- [ ] Should see: Monaco editor with toolbar
- [ ] Test basic run: Write `console.log('hello')` → click **⚡ Run**
- [ ] Should see output in console
- [ ] Click **🤖 AI Status** button
  - [ ] Should show "✅ AI Backend Online"
  - [ ] Should show provider (ollama)
  - [ ] Should show model name
  - [ ] Should list available models

### Phase 5: AI Features Testing (10 minutes)

- [ ] **Format Code**: Write messy code → **✨ Format Code** → should auto-format
- [ ] **Analyze Code**: Write buggy code → **🔍 Analyze** → should find issues
- [ ] **Refactor**: Write code → **♻️ Refactor** → choose option → should refactor
- [ ] **Generate Docs**: Write function → **📚 Generate Docs** → should add docstring

### Phase 6: GPU Optimization (Optional, 5 minutes)

- [ ] Check performance: In AI features, responses should take <5 seconds
- [ ] If slow (>10 seconds):
  - [ ] Check GPU: `nvidia-smi` → GPU utilization should spike during AI calls
  - [ ] Try smaller model: `ollama pull mistral:7b`
  - [ ] Try quantized: `ollama pull codellama:7b-q4`
  - [ ] Set in `.env`: `DEFAULT_MODEL=mistral:7b`

## Quick Verification Commands

```bash
# Verify Node.js is installed
node --version  # Should show v18.0.0 or higher

# Verify Python is installed
python --version  # Should show 3.8+

# Verify Ollama is installed
ollama --version  # Should show version

# Verify Ollama model is downloaded
ollama list  # Should show codellama:7b in list

# Verify Node backend starts
cd backend && npm install && node app.js
# Should see: ✓ Server running on http://localhost:3001

# Verify Python backend starts
cd ai_backend && pip install -r requirements.txt && python main.py
# Should see: INFO: Uvicorn running on http://0.0.0.0:8888

# Verify all services are running (in separate terminal)
curl http://localhost:3001/api/hello           # Node backend
curl http://localhost:8888/health              # Python AI backend
curl http://localhost:11434/api/tags           # Ollama
```

## Troubleshooting Matrix

| Problem | Symptom | Solution |
|---------|---------|----------|
| **No AI features** | 🤖 AI Status shows "offline" | Check all 3 services running (Ollama, Node, Python) |
| **Model not found** | Error 404 from AI backend | Run `ollama pull codellama:7b` |
| **Browser can't connect** | Cannot reach http://localhost:3000 | Check if Node backend (`node app.js`) is running |
| **Slow AI responses** | >15 seconds per analysis | Check GPU with `nvidia-smi`, use smaller model |
| **Out of memory** | GPU memory error | Use quantized model: `ollama pull codellama:7b-q4` |
| **Port already in use** | "Address already in use" error | Kill process: `lsof -i :3001` (Mac/Linux) or `netstat -ano` (Windows) |
| **pip install fails** | Dependency resolution error | Upgrade pip: `pip install --upgrade pip` then retry |
| **Node dependencies missing** | Module not found error | `cd backend && rm package-lock.json && npm install` |

## Configuration File Reference

### `.env` (Optional - in `ai_backend/`)

```bash
# AI Provider (ollama or vllm)
AI_PROVIDER=ollama

# Ollama server URL
OLLAMA_URL=http://localhost:11434

# vLLM server URL (if using vLLM)
VLLM_URL=http://localhost:8000

# Default model to use
DEFAULT_MODEL=codellama:7b

# AI Backend port
AI_BACKEND_PORT=8888

# GPU settings (optional)
CUDA_VISIBLE_DEVICES=0
```

## File Locations

```
c:\projects\Workhorse 2.0\
├── QUICKSTART.md ..................... This setup guide
├── ARCHITECTURE.md ................... This file
│
├── frontend/
│   ├── index.html .................... IDE HTML interface
│   ├── main.js ....................... Bootstrap + orchestration
│   ├── aiService.js .................. AI HTTP client + transport selection
│   ├── chatModule.js ................. Chat orchestration
│   ├── chatRenderModule.js ........... Chat rendering + apply/undo
│   ├── aiFeaturesModule.js ........... Analyze/refactor/docs handlers
│   ├── consoleModule.js .............. Console/status runtime
│   ├── editorModule.js ............... Monaco/editor runtime
│   ├── executionModule.js ............ Format/run execution runtime
│   ├── explorerModule.js ............. Workspace tree/runtime
│   ├── panelResizerModule.js ......... Layout resizing runtime
│   └── styles.css .................... UI styling
│
├── backend/
│   ├── app.js ........................ Express composition entrypoint
│   ├── config.js ..................... Runtime configuration
│   ├── routes/ ....................... Feature routes
│   ├── services/ ..................... Domain services
│   ├── middleware/ ................... Auth/CORS
│   ├── utils/ ........................ Shared backend helpers
│   ├── package.json .................. Node.js dependencies
│   └── package-lock.json ............. Locked versions
│
└── ai_backend/
    ├── main.py ....................... FastAPI app with AI endpoints
    ├── requirements.txt .............. Python dependencies
    ├── .env.example .................. Config template
    ├── README.md ..................... AI backend docs
    └── SETUP.md ...................... GPU optimization guide
```

## Next Steps

1. ✅ **Complete the checklist above**
2. 🎯 **Try writing code and using AI features**
3. 📚 **Read [QUICKSTART.md](QUICKSTART.md) for detailed usage**
4. ⚙️ **See [ai_backend/README.md](ai_backend/README.md) for API reference**
5. 🚀 **Try alternative models or providers (vLLM)**

---

**You now have a complete local AI IDE running on your GPU!** 🎉
