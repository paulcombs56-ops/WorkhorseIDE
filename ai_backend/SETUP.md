# Workhorse AI Backend Setup Guide

This backend runs **local LLMs with GPU acceleration** for code intelligence features.

## Architecture

```
Frontend (React/Monaco)
    ↓
Node.js Backend :3001
    ↓
Python AI Backend :8888 (this service)
    ↓
Ollama/vLLM :11434/:8000
    ↓
GPU (NVIDIA + Ryzen AI NPU)
```

## Prerequisites

- **GPU**: NVIDIA GPU (CUDA 12.x) or AMD GPU with ROCm
- **Ryzen AI NPU**: Optional, for NPU acceleration
- **RAM**: 16GB+ recommended (8GB minimum for smaller models)
- **Storage**: 10-50GB for model weights (depends on model size)

## Step 1: Install Ollama (Recommended for Simplicity)

Ollama handles GPU setup automatically and provides a simple REST API.

### Download Ollama

- **Windows/Mac/Linux**: https://ollama.ai
- Download and run the installer

### Verify Installation

```powershell
ollama --version
```

### Start Ollama Service

```powershell
ollama serve
```

Ollama will run on `http://localhost:11434` by default.

## Step 2: Pull a Code-Focused Model

Code models are optimized for programming tasks and fit well on consumer GPUs.

### CodeLlama (Recommended - 7B and 13B variants)

```bash
ollama pull codellama:7b
```

**GPU memory**: ~5GB (7B), ~12GB (13B)
**Speed**: Fast completions and analysis

### Alternative: Mistral (Smaller, Faster)

```bash
ollama pull mistral:7b
```

**GPU memory**: ~5GB
**Good for**: General-purpose code tasks

### Alternative: Neural Chat (Conversational)

```bash
ollama pull neural-chat:7b
```

**GPU memory**: ~5GB
**Good for**: Code explanation, analysis, discussion

## Step 3: Verify GPU Acceleration

Start Ollama and check that it's using GPU:

```powershell
ollama serve
```

Look for output like:
```
[main] Loading model...
[main] GPU: NVIDIA GeForce RTX 4090
```

If you see `computing on CPU`, check:
1. NVIDIA drivers are up to date
2. CUDA is installed
3. Model fits in VRAM (reduce model size if needed)

## Step 4: Configure Python Backend

### Set Environment Variables

Create a `.env` file in `ai_backend/`:

```bash
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=codellama:7b
```

Or use vLLM (for advanced users):

```bash
AI_PROVIDER=vllm
VLLM_URL=http://localhost:8000
DEFAULT_MODEL=codellama-7b
```

### Install Dependencies

If the workspace includes a `.venv`, use it first (recommended):

```powershell
cd c:\projects\Workhorse 2.0\ai_backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Otherwise:

```powershell
cd c:\projects\Workhorse 2.0\ai_backend
pip install -r requirements.txt
```

### Run the AI Backend

Recommended (workspace `.venv`):

```powershell
..\.venv\Scripts\python.exe main.py
```

Or use system Python:

```powershell
python main.py
```

Backend will start on `http://localhost:8888`

## Step 5: Verify AI Backend

Test the health endpoint:

```bash
curl http://localhost:8888/health
```

You should see:
```json
{
  "status": "ok",
  "provider": "ollama",
  "model": "codellama:7b",
  "ollama_url": "http://localhost:11434"
}
```

## GPU Optimization Tips

### NVIDIA GPUs

1. **Enable CUDA acceleration** (automatic with Ollama)
2. **Check VRAM usage**:
   ```bash
   nvidia-smi
   ```
3. **If running out of VRAM**:
   - Use smaller models (CodeLlama 7B instead of 13B)
   - Reduce `context_length` in requests
   - Enable quantization: `ollama pull codellama:7b-code-q4` (4-bit quantized, ~3GB VRAM)

### AMD GPUs (ROCm)

1. **Install ROCm**: https://rocmdocs.amd.com/en/docs-5.0.2/
2. **Run Ollama with ROCm**:
   ```bash
   set OLLAMA_NUM_GPU=1
   ollama serve
   ```

### Ryzen AI NPU

Ryzen AI NPU provides secondary acceleration. For optimal setup:
1. Enable NPU in BIOS
2. Install latest AMD drivers
3. Use quantized models to fit in NPU memory

## Available Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check backend status |
| `/complete` | POST | Code completion |
| `/analyze` | POST | Code analysis & error detection |
| `/refactor` | POST | Code refactoring |
| `/generate-docs` | POST | Documentation generation |
| `/models` | GET | List available models |

## Example Requests

### Code Completion

```bash
curl -X POST http://localhost:8888/complete \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def greet(name):\n    print(",
    "language": "python",
    "cursor_position": 30,
    "context_lines": 5
  }'
```

### Code Analysis

```bash
curl -X POST http://localhost:8888/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "code": "x = 10\ny = 20\nz = x + ",
    "language": "python"
  }'
```

## Troubleshooting

### Model Not Found

```
Error: "model not found"
```

**Fix**: Pull the model first
```bash
ollama pull codellama:7b
```

### GPU Not Used

**Symptom**: Completions are slow (>5 seconds)

**Fix**: Check `nvidia-smi` output. If GPU memory isn't increasing, check:
- NVIDIA drivers
- CUDA compatibility
- Model size fits in VRAM

### Out of Memory

**Symptom**: `RuntimeError: CUDA out of memory`

**Solutions**:
1. Use a smaller model
2. Use quantized version (e.g., `q4`)
3. Reduce batch size or context length
4. Add more GPU VRAM

### Backend Connection Fails

**Symptom**: `ConnectionError: Cannot connect to Ollama`

**Fix**:
1. Ensure Ollama is running: `ollama serve`
2. Check URL: should be `http://localhost:11434`
3. Verify no firewall blocking port 11434

## Monitoring

### Check GPU Usage in Real-Time

```bash
# NVIDIA
watch nvidia-smi

# AMD (ROCm)
rocm-smi --watch
```

### Check Ollama Logs

```bash
# Ollama logs (depends on OS)
# Windows: Check system logs or run ollama serve with stderr capture
```

## Next Steps

1. **Wire AI backend to Node.js backend** → Node.js proxy routes requests to Python AI backend
2. **Implement frontend UI components** → Connect Monaco editor to AI endpoints
3. **Add streaming responses** → For real-time code completions
4. **Fine-tune models** → Optional, for domain-specific code assistance

## References

- Ollama Docs: https://github.com/ollama/ollama
- CodeLlama: https://github.com/facebookresearch/codellama
- vLLM (for advanced inference): https://github.com/lm-sys/vllm
- NVIDIA CUDA: https://developer.nvidia.com/cuda-downloads
