# Workhorse IDE - Quick Start Guide

## What is Workhorse IDE?

A browser-based code editor with **local GPU-accelerated AI** for code intelligence—no cloud dependencies, complete privacy.

Features:
- 📝 **Code Editor** - JavaScript & Python syntax highlighting (Monaco Editor)
- ⚡ **Sandboxed Local Execution** - Run JS and Python in isolated backend sandboxes
- ✨ **Code Formatting** - Prettier (JS) + Black (Python)
- 🤖 **AI Code Intelligence** - Local LLM-powered features (requires GPU)
  - 🔍 Code Analysis - Find bugs and issues
  - ♻️ Code Refactoring - Simplify, extract functions, optimize
  - 📚 Documentation Generation - Auto-generate docstrings
  - 🎯 Code Completion (future)

## Setup (30 minutes)

### Step 1: Install Ollama

Download from https://ollama.ai and install for your OS.

Verify:
```bash
ollama --version
```

### Step 2: Pull a Code Model

```bash
ollama pull codellama:7b
```

This downloads ~5GB (requires GPU VRAM).

### Step 3: Start Ollama

Open a new terminal and run:
```bash
ollama serve
```

Leave this running. You'll see:
```
started serving
```

### Step 4: Install Node Dependencies

```bash
cd backend
npm install
```

This adds `express-http-proxy` module.

### Step 5: Install Python Dependencies

If the workspace includes a `.venv`, use it first (recommended):

```powershell
cd ai_backend
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Otherwise:

```bash
cd ai_backend
pip install -r requirements.txt
```

### Step 6: Start Node Backend

In the `backend` folder:
```bash
node app.js
```

You should see:
```
✓ Server running on http://localhost:3001
✓ CORS enabled
```

Optional hardening for local/LAN use:

```powershell
$env:ALLOWED_ORIGINS = "http://localhost:3001,http://127.0.0.1:3001"
$env:WORKHORSE_API_TOKEN = "replace-with-a-strong-token"
node app.js
```

If token protection is enabled, set the same token in the browser console before using protected workspace actions:

```javascript
localStorage.setItem("workhorse-api-token", "replace-with-a-strong-token");
```

### Step 7: Start Python AI Backend

In a new terminal, in the `ai_backend` folder:
```powershell
..\.venv\Scripts\python.exe main.py
```

If you are not using a virtual environment:

```bash
python main.py
```

You should see:
```
INFO: Uvicorn running on http://0.0.0.0:8888
```

### Step 8: Open the IDE

Open a browser and go to:
```
http://localhost:3001/index.html
```

### Step 9: Run AI Smoke Test (Recommended)

Run a one-command verification for health, analyze, refactor, and docs endpoints:

```powershell
.\verify-ai-smoke.ps1
```

Expected result:
```
[SUCCESS] AI smoke test passed
```

## Optional: Auto-Start Services on Windows Login

Use the built-in startup script to launch missing services automatically:

```powershell
cd "C:\projects\Workhorse 2.0"
.\start-workhorse.ps1
```

Create a Task Scheduler entry (current user, at logon):

```powershell
$script = "C:\projects\Workhorse 2.0\start-workhorse.ps1"
schtasks /Create /TN "Workhorse IDE Services" /SC ONLOGON /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"$script\"" /F
```

Remove the auto-start task later if needed:

```powershell
schtasks /Delete /TN "Workhorse IDE Services" /F
```

### Optional: Desktop One-Click Shortcuts (Windows)

You can use these Desktop shortcuts for daily workflow:

- **Start Workhorse IDE Services**: runs `start-workhorse.ps1` to start any missing services.
- **Verify Workhorse Services**: runs `verify-services.bat` and shows current health status.

If you need to recreate them manually later, run:

```powershell
# Startup shortcut
$workspace = "C:\projects\Workhorse 2.0"
$scriptPath = Join-Path $workspace "start-workhorse.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")
$startShortcutPath = Join-Path $desktop "Start Workhorse IDE Services.lnk"
$wsh = New-Object -ComObject WScript.Shell
$startShortcut = $wsh.CreateShortcut($startShortcutPath)
$startShortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$startShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$startShortcut.WorkingDirectory = $workspace
$startShortcut.Save()

# Verify shortcut
$verifyPath = Join-Path $workspace "verify-services.bat"
$verifyShortcutPath = Join-Path $desktop "Verify Workhorse Services.lnk"
$verifyCmd = "cmd /c `"`"$verifyPath`" && pause`""
$verifyBytes = [System.Text.Encoding]::Unicode.GetBytes($verifyCmd)
$verifyEncoded = [Convert]::ToBase64String($verifyBytes)
$verifyShortcut = $wsh.CreateShortcut($verifyShortcutPath)
$verifyShortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$verifyShortcut.Arguments = "-NoProfile -EncodedCommand $verifyEncoded"
$verifyShortcut.WorkingDirectory = $workspace
$verifyShortcut.Save()
```

## Using the IDE

### Toolbar Buttons

| Button | Description |
|--------|-------------|
| **⚡ Run** | Execute JavaScript or Python in backend sandbox with streaming output |
| **✨ Format Code** | Auto-format with Prettier (JS) or Black (Python) |
| **🔍 Analyze** | Find bugs, issues, and code smells (AI) |
| **♻️ Refactor** | Simplify, extract functions, optimize (AI) |
| **📚 Generate Docs** | Auto-generate docstrings (AI) |
| **🤖 AI Status** | Check if AI backend is online and working |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Enter** | Run code |
| **↑ / ↓** | Navigate command history in editor |
| **Ctrl+Z** | Undo (Monaco default) |
| **Ctrl+Shift+F** | Format document (Monaco default) |

### Console Themes

Switch console color scheme from the **Console Theme** dropdown:
- **Dark** (default) - Clean white on black
- **Neon** - Bright green with glow effect
- **Hacker Green** - Classic terminal green

## Example Workflows

### 1. Write and Run JavaScript

```javascript
// Write this in editor
const greet = (name) => {
  return `Hello, ${name}!`;
};
console.log(greet("Workhorse"));

// Click "⚡ Run"
// Output: Hello, Workhorse!
```

### 2. Run Python

```python
# Write this in editor
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))

# Click "⚡ Run"
# Output: 55
```

### 3. Format Code

```javascript
// Badly formatted code
const x  =  { a: 1,b:2,  c: 3 }
function foo(  ){return x}

// Click "✨ Format Code"
// Auto-formatted:
const x = { a: 1, b: 2, c: 3 };
function foo() {
  return x;
}
```

### 4. Analyze Code for Issues

```python
# write messy code
def bad_func():
    x = 10
    y = x + undefined_var
    return z  # z is never set

# Click "🔍 Analyze"
# Output: Shows undefined variables, unused assignments, etc.
```

### 5. Refactor Code

```python
# Write code
if result == True:
    print("success")

# Click "♻️ Refactor" → choose "simplify"
# Output:
if result:
    print("success")
```

### 6. Generate Documentation

```javascript
// Write function
function calculateArea(radius) {
  return Math.PI * radius * radius;
}

// Click "📚 Generate Docs" → choose "google"
// Output:
/**
 * Calculate the area of a circle.
 * @param {number} radius - The radius of the circle
 * @returns {number} The area of the circle
 */
function calculateArea(radius) {
  return Math.PI * radius * radius;
}
```

## Troubleshooting AI Features

### Problem: "AI Backend Offline"

When you click **🤖 AI Status**, see "AI Backend Offline"

**Solution:**

1. Check if Ollama is running:
   ```bash
   ollama serve
   ```

2. Check if Python backend is running:
   ```bash
   python ai_backend/main.py
   ```

3. Check if Node backend is running:
   ```bash
   node backend/app.js
   ```

4. Verify ports are open:
   - http://localhost:3001 (Node)
   - http://localhost:8888 (Python AI)
   - http://localhost:11434 (Ollama)

### Problem: "Out of Memory" / AI is slow

**Solution:**

1. Check GPU usage:
   ```bash
   nvidia-smi -l 1
   ```

2. Use a smaller model:
   ```bash
   ollama pull mistral:7b
   ```

3. Use quantized version:
   ```bash
   ollama pull codellama:7b-q4
   ```

4. Set in AI backend `.env`:
   ```
   DEFAULT_MODEL=mistral:7b
   ```

### Problem: Can't install dependencies

**Solution:**

For **Node.js** errors:
```bash
cd backend
rm package-lock.json
npm install
```

For **Python** errors:
```bash
cd ai_backend
pip install --upgrade pip
pip install -r requirements.txt --no-cache-dir
```

## File Structure

```
Workhorse 2.0/
├── frontend/
│   ├── index.html          # IDE HTML
│   ├── main.js             # Bootstrap + orchestration
│   ├── aiService.js        # AI API client + transport
│   ├── chatModule.js
│   ├── chatRenderModule.js
│   ├── aiFeaturesModule.js
│   ├── consoleModule.js
│   ├── editorModule.js
│   ├── executionModule.js
│   ├── explorerModule.js
│   ├── panelResizerModule.js
│   └── styles.css          # Styling
├── backend/
│   ├── app.js              # Express route composition
│   ├── routes/             # API routes
│   ├── services/           # Domain services
│   ├── middleware/         # Auth/CORS middleware
│   ├── utils/              # Backend helpers
│   └── config.js           # Runtime config/env parsing
│   ├── package.json        # Node dependencies
│   └── package-lock.json
├── ai_backend/
│   ├── main.py             # FastAPI AI server
│   ├── requirements.txt    # Python dependencies
│   ├── .env                # Config (created from .env.example)
│   ├── .env.example        # Config template
│   ├── README.md           # AI backend docs
│   └── SETUP.md            # GPU setup guide
└── QUICKSTART.md           # This file
```

## Next Steps

1. ✅ **Already Done:**
   - Installed Ollama and pulled model
   - Started all three services
   - Opened IDE in browser

2. **Try AI Features:**
   - Click **🤖 AI Status** to verify everything works
   - Write some code
   - Click **🔍 Analyze** to find issues
   - Click **♻️ Refactor** to improve code

3. **Advanced (Optional):**
   - Use vLLM instead of Ollama for faster inference
   - Switch to different models (Mistral, Neural Chat)
   - Implement real-time code completion (as-you-type)
   - Add model switcher UI

## Performance Tips

- **16GB GPU**: Use CodeLlama 7B (recommended)
- **8GB GPU**: Use Mistral 7B or CodeLlama 7B quantized
- **Limited VRAM**: Use Neural Chat 7B
- **Multiple analyses**: Batch requests together

## Resources

- [Ollama Docs](https://ollama.ai)
- [Monaco Editor Docs](https://microsoft.github.io/monaco-editor/)
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [Workhorse IDE (This Project)]

## Getting Help

1. Check console output for error messages
2. Verify all 3 services are running:
   - Ollama: `ollama serve` running
   - Node: `node backend/app.js` output visible
   - Python: `python ai_backend/main.py` output visible
3. Check AI backend health: Click **🤖 AI Status**
4. Review [ai_backend/SETUP.md](ai_backend/SETUP.md) for GPU troubleshooting

---

**Happy coding with local AI! 🚀**
