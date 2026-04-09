# Local Coding Agent Setup (GPU)

This gives you a local coding workflow that feels close to Claude/Copilot while using your own GPU via Ollama.

## What you get

- Local chat + code-edit agent using `aider`
- Repo-aware file editing from natural language prompts
- GPU inference via local Ollama models

## Prerequisites

- Ollama installed and working
- A model pulled (recommended: `qwen2.5-coder:14b`)
- Python virtual environment in this workspace (`.venv`)

## Install / update the agent (Aider path)

```powershell
cd "C:\projects\Workhorse 2.0"
.\.venv\Scripts\python.exe -m pip install -U aider-chat
```

If this fails in your environment, it is usually a Python/package-index compatibility issue (for example Python 3.14 with older mirrored `aider-chat` versions).

## Start the local coding agent

```powershell
cd "C:\projects\Workhorse 2.0"
.\start-local-agent.ps1
```

Behavior:

- Uses `aider` automatically when installed.
- Falls back to `ollama run` with a coding-agent system prompt when aider is unavailable.

Optional model override:

```powershell
.\start-local-agent.ps1 -Model qwen2.5-coder:7b
```

## Typical usage inside aider

- `add frontend/main.js`
- `add backend/app.js`
- `Please add a health endpoint and update docs.`
- `Run tests and fix failures.`

## VS Code chat-style experience (Copilot-like)

For a Copilot-like panel in VS Code, use the Continue extension configured with Ollama:

- Provider: `ollama`
- Model: `qwen2.5-coder:14b`
- Endpoint: `http://localhost:11434`

This repo includes a starter config at `.continue/config.json`.

You can keep Continue for inline/chat UX and use aider for autonomous multi-file changes.
