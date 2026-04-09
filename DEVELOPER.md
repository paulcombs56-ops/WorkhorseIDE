# Workhorse IDE - Developer Guide

Extended development guide for implementing new features, extending AI capabilities, and customizing the IDE.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adding New AI Features](#adding-new-ai-features)
3. [Extending the Frontend](#extending-the-frontend)
4. [Modifying the Backend](#modifying-the-backend)
5. [Performance Optimization](#performance-optimization)
6. [Debugging Tips](#debugging-tips)

## Architecture Overview

### Three-Tier Architecture

```
┌─────────────────────────┐
│   Frontend (Browser)    │ Port 3000/5173
├─────────────────────────┤
│  • Monaco Editor        │
│  • Console UI           │
│  • AI Service Client    │
└──────────────┬──────────┘
               │ HTTP/Proxy
               ▼
┌─────────────────────────┐
│  Backend (Node.js)      │ Port 3001
├─────────────────────────┤
│  • Express Server       │
│  • Code Formatting      │
│  • Python Execution     │
│  • AI Proxy Router      │
└──────────────┬──────────┘
               │ HTTP
               ▼
┌─────────────────────────┐
│ AI Backend (FastAPI)    │ Port 8888
├─────────────────────────┤
│  • Code Analysis        │
│  • Refactoring          │
│  • Documentation Gen    │
│  • Ollama/vLLM Proxy    │
└──────────────┬──────────┘
               │ REST API
               ▼
┌─────────────────────────┐
│ LLM Engine (Ollama)     │ Port 11434
├─────────────────────────┤
│  • CodeLlama            │
│  • Mistral              │
│  • Neural Chat          │
└─────────────────────────┘
```

## Adding New AI Features

### Step 1: Add Endpoint to FastAPI Backend

Edit `ai_backend/main.py`:

```python
from fastapi import FastAPI
from pydantic import BaseModel

# Define request model
class CustomRequest(BaseModel):
    code: str
    language: str
    param: str = "default"

# Define response model
class CustomResponse(BaseModel):
    result: str
    metadata: dict = {}

# Add endpoint
@app.post("/custom-feature")
async def custom_feature(req: CustomRequest) -> CustomResponse:
    """Your custom AI feature"""
    
    # Prepare prompt for LLM
    prompt = f"""
    Given this {req.language} code:
    {req.code}
    
    {req.param}
    """
    
    # Call LLM via Ollama
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": prompt,
                "stream": False
            }
        )
    
    result = response.json()["response"]
    
    return CustomResponse(
        result=result,
        metadata={"provider": AI_PROVIDER, "model": DEFAULT_MODEL}
    )
```

### Step 2: Add Frontend Service Method

Edit `frontend/aiService.js`:

```javascript
async customFeature(code, language, param = "default") {
    try {
        const res = await fetch("http://localhost:3001/ai/custom-feature", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language, param })
        });
        return res.ok ? res.json() : { result: "Feature unavailable" };
    } catch (err) {
        return { result: `Error: ${err.message}` };
    }
}
```

### Step 3: Add UI Button

Edit `frontend/index.html`:

```html
<button id="custom-btn" title="Your feature description">🎯 Feature Name</button>
```

### Step 4: Add Button Handler

Edit `frontend/main.js`:

```javascript
document.getElementById("custom-btn").onclick = async () => {
    const code = window.editor.getValue();
    const lang = document.getElementById("language-select").value;
    
    clearConsole();
    writeToConsole("🎯 Processing...", "log");
    
    const result = await aiService.customFeature(code, lang, "param_value");
    
    writeToConsole("✅ Complete!", "result");
    writeToConsole(result.result, "log");
};
```

### Step 5: Add Styling (Optional)

Edit `frontend/styles.css`:

```css
#custom-btn {
    background: #d32f2f;  /* Red for custom features */
    border: 1px solid #f44336;
}

#custom-btn:hover {
    background: #c62828;
}
```

### Complete Example: "Simplify Code" Feature

```python
# FastAPI endpoint
@app.post("/simplify")
async def simplify_code(req: CodeRefactorRequest) -> CodeRefactorResponse:
    """Simplify code without changing functionality"""
    
    prompt = f"""Simplify this {req.language} code while maintaining functionality:

{req.code}

Return ONLY the simplified code."""
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": DEFAULT_MODEL, "prompt": prompt, "stream": False}
        )
    
    return CodeRefactorResponse(
        refactored_code=response.json()["response"],
        explanation="Code simplified for readability"
    )
```

## Extending the Frontend

### Add New Language Support

1. **Monaco Editor Setup**:

```javascript
// In main.js, update language-select handler
document.getElementById("language-select").addEventListener("change", (e) => {
    const newLang = e.target.value;
    monaco.editor.setModelLanguage(window.editor.getModel(), newLang);
    
    if (newLang === "rust") {
        window.editor.setValue(`fn main() {\n    println!("Hello from Rust!");\n}`);
    }
});
```

2. **Add HTML Option**:

```html
<select id="language-select">
    <option value="javascript">JavaScript</option>
    <option value="python">Python</option>
    <option value="rust">Rust</option>
</select>
```

### Add New Console Theme

1. **Add CSS**:

```css
.console-cyberpunk {
    background: #0d0221;
    color: #ff006e;
    text-shadow: 0 0 5px #ff006e;
}
```

2. **Update Handler**:

```javascript
document.getElementById("console-theme").addEventListener("change", (e) => {
    const theme = e.target.value;
    const consoleEl = document.getElementById("console");
    
    consoleEl.classList.remove("console-dark", "console-neon", "console-hacker", "console-cyberpunk");
    consoleEl.classList.add(`console-${theme}`);
});
```

3. **Add HTML Option**:

```html
<select id="console-theme">
    <option value="dark">Dark</option>
    <option value="neon">Neon</option>
    <option value="hacker">Hacker Green</option>
    <option value="cyberpunk">Cyberpunk</option>
</select>
```

### Real-Time Code Completion (As-You-Type)

```javascript
// Add to main.js
window.editor.onDidChangeModelContent(() => {
    const code = window.editor.getValue();
    const position = window.editor.getPosition();
    
    // Debounce to avoid too many requests
    clearTimeout(window.completionTimeout);
    window.completionTimeout = setTimeout(async () => {
        const completion = await aiService.getCodeCompletion(
            code,
            document.getElementById("language-select").value,
            code.length - 1
        );
        
        if (completion && completion.completion) {
            // Show in-line suggestion (IntelliSense)
            // Implementation depends on Monaco capabilities
        }
    }, 500); // Wait 500ms after typing stops
});
```

## Modifying the Backend

### Add New Python Execution Runtime

Edit `backend/app.js`:

```javascript
app.post("/run-ruby", (req, res) => {
    const { code } = req.body;
    const stream = res;
    
    stream.setHeader("Content-Type", "text/event-stream");
    stream.setHeader("Cache-Control", "no-cache");
    stream.setHeader("Connection", "keep-alive");
    
    const ruby = spawn("ruby", ["-e", code]);
    
    ruby.stdout.on("data", (data) => {
        stream.write(`data: ${data.toString()}\n\n`);
    });
    
    ruby.stderr.on("data", (data) => {
        stream.write(`data: ERROR:${data.toString()}\n\n`);
    });
    
    ruby.on("close", () => {
        stream.write("data: __END__\n\n");
        stream.end();
    });
});
```

### Add Code Linting

```javascript
app.post("/lint", (req, res) => {
    const { code, language } = req.body;
    let linter;
    
    if (language === "javascript") {
        // Use eslint
        linter = spawn("npx", ["eslint", "--stdin", "--format", "json"]);
    } else if (language === "python") {
        // Use pylint
        linter = spawn("pylint", ["--exit-zero", "--output-format=json"]);
    }
    
    linter.stdin.write(code);
    linter.stdin.end();
    
    let output = "";
    linter.stdout.on("data", (data) => {
        output += data.toString();
    });
    
    linter.on("close", () => {
        res.json(JSON.parse(output || "[]"));
    });
});
```

## Performance Optimization

### 1. Caching Completions

```javascript
const completionCache = new Map();

async function getCompletion(code) {
    const hash = btoa(code); // Simple hash
    
    if (completionCache.has(hash)) {
        return completionCache.get(hash);
    }
    
    const result = await aiService.getCodeCompletion(code, "python");
    completionCache.set(hash, result);
    
    return result;
}
```

### 2. Batch AI Requests

```javascript
const requestQueue = [];
let batchTimeout = null;

function queueRequest(request) {
    requestQueue.push(request);
    
    clearTimeout(batchTimeout);
    batchTimeout = setTimeout(() => {
        processBatch();
    }, 1000); // Wait 1s to collect requests
}

async function processBatch() {
    if (requestQueue.length === 0) return;
    
    const batch = requestQueue.splice(0);
    
    // Send all at once (implement batch endpoint in backend)
    const response = await fetch("http://localhost:3001/ai/batch", {
        method: "POST",
        body: JSON.stringify({ requests: batch })
    });
    
    // Process results
}
```

### 3. Monitor GPU Usage

```python
# In ai_backend/main.py
import psutil
import GPUtil

@app.get("/gpu-status")
async def gpu_status():
    """Monitor GPU utilization"""
    try:
        gpus = GPUtil.getGPUs()
        return {
            "gpus": [
                {
                    "id": gpu.id,
                    "name": gpu.name,
                    "load": gpu.load * 100,  # Percentage
                    "memory_total": gpu.memoryTotal,
                    "memory_used": gpu.memoryUsed,
                    "memory_free": gpu.memoryFree
                }
                for gpu in gpus
            ]
        }
    except:
        return {"error": "GPU monitoring unavailable"}
```

## Debugging Tips

### Frontend Debugging

1. **Browser DevTools**:
```javascript
// Log all AI service calls
window.oldFetch = window.fetch;
window.fetch = function(...args) {
    console.log("API Call:", args[0], args[1]);
    return window.oldFetch.apply(this, args);
};
```

2. **Monitor Editor State**:
```javascript
// Watch for code changes
window.editor.onDidChangeModelContent(() => {
    console.log("Code changed:", window.editor.getValue().length, "chars");
});
```

### Backend Debugging

1. **Express Logging**:
```javascript
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
```

2. **Python Logging**:
```python
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@app.post("/analyze")
async def analyze(req: CodeAnalysisRequest):
    logger.debug(f"Analyzing {len(req.code)} chars of {req.language}")
    # ... rest of function
```

### Service Status Checks

```bash
# Terminal 1: Monitor Ollama
watch -n 1 nvidia-smi

# Terminal 2: Monitor requests
# In Node backend folder
npm install --save-dev nodemon
nodemon app.js

# Terminal 3: Monitor Python backend
# In ai_backend folder
pip install python-json-logger
python -m pip install -e .

# Terminal 4: Tail all logs
alias logs="cd backend && tail -f *.log & cd ../ai_backend && tail -f *.log"
```

## Testing

### Frontend Tests

```javascript
// frontend/tests/aiService.test.js
describe("aiService", () => {
    test("should call health endpoint", async () => {
        const health = await aiService.checkHealth();
        expect(health.status).toBe("ok");
    });
    
    test("should analyze code", async () => {
        const result = await aiService.analyzeCode("x = y + z", "python");
        expect(result.issues).toBeDefined();
        expect(Array.isArray(result.issues)).toBe(true);
    });
});
```

### Backend Tests

```python
# ai_backend/tests/test_main.py
import pytest
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert "provider" in response.json()

def test_analyze():
    response = client.post("/analyze", json={
        "code": "x = y + z",
        "language": "python"
    })
    assert response.status_code == 200
    assert "issues" in response.json()
```

## Deployment

### Docker Containerization

```dockerfile
# Dockerfile (in ai_backend/)
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY main.py .
EXPOSE 8888

CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]
```

```bash
# Build & run
docker build -t workhorse-ai .
docker run -p 8888:8888 workhorse-ai
```

### Systemd Service (Linux)

```ini
# /etc/systemd/system/workhorse-ai.service
[Unit]
Description=Workhorse IDE - AI Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/www-data/workhorse
ExecStart=/usr/bin/python3 /home/www-data/workhorse/ai_backend/main.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
# Enable & start
sudo systemctl enable workhorse-ai
sudo systemctl start workhorse-ai
sudo systemctl status workhorse-ai
```

## Contributing

1. **Fork the project**
2. **Create feature branch**: `git checkout -b feature/my-feature`
3. **Commit changes**: `git commit -am "Add feature"`
4. **Push to branch**: `git push origin feature/my-feature`
5. **Submit pull request**

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Express.js Guide](https://expressjs.com)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/docs.html)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Python Async/Await](https://docs.python.org/3/library/asyncio.html)

---

Happy hacking! 🎉
