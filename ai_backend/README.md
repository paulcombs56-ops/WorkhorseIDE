# Workhorse IDE - Python AI Backend

**GPU-accelerated code intelligence for your local IDE**

This is the AI engine for Workhorse IDE. It provides:
- 🚀 Code completion with local LLMs
- 🔍 Code analysis and bug detection
- ♻️ Intelligent code refactoring
- 📚 Automatic documentation generation
- 🎮 GPU acceleration (NVIDIA CUDA + Ryzen AI NPU support)
- 🔒 100% local & private (no API calls, no cloud dependencies)

## Quick Start

### 1. Install Ollama

```bash
# Download and install from https://ollama.ai
ollama --version  # Verify installation
```

### 2. Pull a Code Model

```bash
ollama pull codellama:7b
```

### 3. Start Ollama Service

```bash
ollama serve
# Runs on http://localhost:11434
```

### 4. Install Python Dependencies

```bash
cd ai_backend
pip install -r requirements.txt
```

### 5. Run AI Backend

```bash
python main.py
# Runs on http://localhost:8888
```

### 6. Verify It Works

```bash
curl http://localhost:8888/health
```

You should see:
```json
{
  "status": "ok",
  "provider": "ollama",
  "model": "codellama:7b"
}
```

## In the IDE

The Node.js backend proxies all `/ai/*` requests to this Python server.

**Frontend calls**:
```javascript
// Completion
POST http://localhost:3001/ai/complete
// Analysis
POST http://localhost:3001/ai/analyze
// Refactoring
POST http://localhost:3001/ai/refactor
// Docs
POST http://localhost:3001/ai/generate-docs
```

## API Reference

### Health Check

```bash
GET /health
```

Returns backend status and model info.

### Code Completion

```bash
POST /complete
Content-Type: application/json

{
  "code": "def greet(name):\n    print(",
  "language": "python",
  "cursor_position": 30,
  "context_lines": 10
}
```

**Response**:
```json
{
  "completion": "f\"Hello {name}!\")",
  "confidence": 0.85
}
```

### Code Analysis

```bash
POST /analyze
Content-Type: application/json

{
  "code": "x = 10\ny = x + 20\nprint(z)",
  "language": "python"
}
```

**Response**:
```json
{
  "issues": [
    {"line": 3, "message": "Variable 'z' is not defined"}
  ],
  "suggestions": [
    "Define z before using it",
    "Check for typos in variable names"
  ]
}
```

### Code Refactoring

```bash
POST /refactor
Content-Type: application/json

{
  "code": "if x == True:\n    print('yes')",
  "language": "python",
  "refactor_type": "simplify"
}
```

**Refactor types**:
- `simplify` - Simplify code logic
- `extract-function` - Extract into a function
- `rename-variable` - Improve variable names
- `optimize` - Performance optimization

**Response**:
```json
{
  "refactored_code": "if x:\n    print('yes')",
  "explanation": "Removed redundant == True comparison"
}
```

### Documentation Generation

```bash
POST /generate-docs
Content-Type: application/json

{
  "code": "def add(a, b):\n    return a + b",
  "language": "python",
  "style": "google"
}
```

**Styles**:
- `google` - Google-style docstrings
- `numpy` - NumPy-style docstrings
- `sphinx` - Sphinx docstrings

**Response**:
```json
{
  "documentation": "def add(a, b):\n    \"\"\"Add two numbers.\n    \n    Args:\n        a: First number\n        b: Second number\n    \n    Returns:\n        Sum of a and b\n    \"\"\"\n    return a + b"
}
```

### List Available Models

```bash
GET /models
```

Returns list of models available in Ollama/vLLM.

```json
{
  "provider": "ollama",
  "models": ["codellama:7b", "mistral:7b", "neural-chat:7b"]
}
```

## Configuration

Set via environment variables:

```bash
# Provider: "ollama" or "vllm"
AI_PROVIDER=ollama

# Ollama URL
OLLAMA_URL=http://localhost:11434

# Default model to use
DEFAULT_MODEL=codellama:7b

# Optional chat-focused model for better conversational quality
# Falls back to DEFAULT_MODEL if omitted
CHAT_MODEL=gemma3:4b
```

Or create a `.env` file in the `ai_backend/` directory.

## GPU Optimization

### Check GPU Usage

```bash
# NVIDIA
nvidia-smi -l 1  # Refresh every 1 second
```

### Best Models by VRAM

| Model | VRAM | Speed | Quality |
|-------|------|-------|---------|
| CodeLlama 7B | ~5GB | Fast | Good |
| CodeLlama 7B (Q4) | ~3GB | Fast | Decent |
| CodeLlama 13B | ~12GB | Medium | Better |
| Mistral 7B | ~5GB | Fast | Good |
| Neural Chat 7B | ~5GB | Fast | Good |

### Recommended Setup

**16GB NVIDIA GPU** (RTX 4060, RTX 4070):
```bash
ollama pull codellama:7b
```

**8GB NVIDIA GPU** (RTX 3060, RTX 4050):
```bash
ollama pull mistral:7b
# or use quantized version
ollama pull codellama:7b-q4
```

**Lower VRAM**:
```bash
ollama pull neural-chat:7b
```

## Troubleshooting

### Backend won't start

```
ConnectionError: Cannot connect to Ollama
```

**Fix**: Ensure Ollama is running in another terminal:
```bash
ollama serve
```

### Model not found

```
HTTPError: 404
```

**Fix**: Pull the model first:
```bash
ollama pull codellama:7b
```

### GPU not being used (slow responses)

**Symptom**: Completions take >10 seconds

**Solutions**:
1. Check `nvidia-smi` - GPU memory should increase during inference
2. Verify CUDA/ROCm installation
3. Use smaller model: `ollama pull mistral:7b`
4. Check VRAM: `nvidia-smi | grep memory`

### Out of memory

```
RuntimeError: CUDA out of memory
```

**Solutions**:
1. Use quantized model (4-bit): `ollama pull codellama:7b-q4`
2. Use smaller model: `mistral:7b` or `neural-chat:7b`
3. Close other GPU applications

## Architecture

```
┌─────────────────────┐
│  Workhorse IDE UI   │ (React + Monaco)
│  Frontend (Port 3000│
└──────────┬──────────┘
           │
           │ /ai/complete
           │ /ai/analyze
           │ /ai/refactor
           │ /ai/generate-docs
           ▼
┌──────────────────────┐
│   Node.js Backend    │ (Port 3001)
│  express-http-proxy │ ◄──── Proxies /ai/* requests
└──────────┬───────────┘
           │
           │ HTTP
           ▼
┌──────────────────────┐
│  Python AI Backend   │ (Port 8888)
│     FastAPI          │
│  GPU Inference       │
└──────────┬───────────┘
           │
           │ REST API
           ▼
┌──────────────────────┐
│  Ollama/vLLM         │ (Port 11434/8000)
│  LLM Engine          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   GPU / NPU          │
│ NVIDIA CUDA / ROCm   │
│ Ryzen AI NPU         │
└──────────────────────┘
```

## Performance Tips

1. **Batch requests** - Combine multiple analyses into one request
2. **Use smaller context** - Reduce `context_lines` parameter for faster completion
3. **Cache results** - Store completions in frontend for repeated patterns
4. **Monitor VRAM** - Keep an eye on `nvidia-smi` to ensure model fits
5. **Quantized models** - Use 4-bit or 8-bit quantization for better speed with minimal loss

## Advanced: Using vLLM Instead

For even faster inference on powerful GPUs:

1. **Install vLLM**:
   ```bash
   pip install vllm
   ```

2. **Start vLLM server**:
   ```bash
   python -m vllm.entrypoints.openai.api_server --model codellama/CodeLlama-7b --dtype float16
   ```

3. **Configure backend**:
   ```bash
   export AI_PROVIDER=vllm
   export VLLM_URL=http://localhost:8000
   python main.py
   ```

## Security Notes

- ✅ All inference runs locally on your machine
- ✅ No data sent to external servers
- ✅ Model weights stay on your GPU/disk
- ✅ No API keys needed
- ✅ HTTPS not required (all local)

## Contributing

To add new AI features:

1. Add endpoint to `main.py`
2. Create request/response Pydantic models
3. Add service method to `frontend/aiService.js`
4. Wire UI component to call the service

## License

Same as Workhorse IDE
