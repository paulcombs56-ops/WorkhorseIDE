param(
    [string]$Model = "qwen2.5-coder:14b",
    [string]$FallbackModel = "qwen2.5-coder:7b"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $PSCommandPath

function Test-TcpPort {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [string]$TargetHost = "127.0.0.1",
        [int]$TimeoutMs = 1200
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            $client.Close()
            return $false
        }
        $client.EndConnect($async)
        $client.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Ensure-OllamaRunning {
    if (Test-TcpPort -Port 11434) {
        Write-Host "[OK] Ollama is running"
        return
    }

    Write-Host "[START] Ollama"
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden | Out-Null

    for ($attempt = 1; $attempt -le 10; $attempt++) {
        if (Test-TcpPort -Port 11434) {
            Write-Host "[OK] Ollama is up"
            return
        }
        Start-Sleep -Milliseconds 800
    }

    throw "Ollama did not start on port 11434"
}

function Resolve-AiderPath {
    $venvAider = Join-Path $scriptRoot ".venv\Scripts\aider.exe"

    if (Test-Path $venvAider) {
        return $venvAider
    }

    $cmd = Get-Command aider -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Path
    }

    return ""
}

function Get-AvailableModels {
    $lines = ollama list | Select-Object -Skip 1
    return @($lines | ForEach-Object { ($_ -split "\s+")[0] } | Where-Object { $_ })
}

Write-Host "===================================="
Write-Host "Workhorse Local Coding Agent"
Write-Host "===================================="

Ensure-OllamaRunning

$availableModels = Get-AvailableModels
$selectedModel = $Model
if ($availableModels -notcontains $Model) {
    if ($availableModels -contains $FallbackModel) {
        $selectedModel = $FallbackModel
        Write-Host "[INFO] Primary model not found. Using fallback: $selectedModel"
    }
    elseif ($availableModels.Count -gt 0) {
        $selectedModel = $availableModels[0]
        Write-Host "[INFO] Preferred models missing. Using installed model: $selectedModel"
    }
    else {
        throw "No Ollama models found. Run: ollama pull qwen2.5-coder:14b"
    }
}

$aiderPath = Resolve-AiderPath
Set-Location $scriptRoot

if (-not [string]::IsNullOrWhiteSpace($aiderPath)) {
    Write-Host "[START] Aider model: ollama/$selectedModel"
    & $aiderPath --model "ollama/$selectedModel"
    exit $LASTEXITCODE
}

Write-Host "[INFO] Aider is unavailable in this Python environment/package index."
Write-Host "[START] Fallback local coding agent (Ollama chat)"
Write-Host "[TIP] For VS Code Copilot-like UX, install Continue extension and use .continue/config.json"
Write-Host ""
Write-Host "Fallback mode usage:"
Write-Host "  - Type requests like: 'Refactor frontend/main.js and explain changes'"
Write-Host "  - Use Ctrl+C to exit"
Write-Host ""

ollama run $selectedModel
