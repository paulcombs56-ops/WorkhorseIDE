$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

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

function Start-OllamaIfNeeded {
    if (Test-TcpPort -Port 11434) {
        Write-Host "[OK] Ollama already running"
        return
    }

    Write-Host "[START] Ollama"
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden | Out-Null
}

function Start-NodeBackendIfNeeded {
    if (Test-TcpPort -Port 3001) {
        Write-Host "[OK] Node backend already running"
        return
    }

    Write-Host "[START] Node backend"
    $backendDir = Join-Path $workspaceRoot "backend"
    Start-Process -FilePath "node" -ArgumentList "app.js" -WorkingDirectory $backendDir -WindowStyle Hidden | Out-Null
}

function Start-PythonBackendIfNeeded {
    if (Test-TcpPort -Port 8888) {
        Write-Host "[OK] Python backend already running"
        return
    }

    $venvPython = Join-Path $workspaceRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $pythonExe = $venvPython
    }
    else {
        $pythonExe = "python"
    }

    Write-Host "[START] Python backend"
    $aiBackendDir = Join-Path $workspaceRoot "ai_backend"
    Start-Process -FilePath $pythonExe -ArgumentList "main.py" -WorkingDirectory $aiBackendDir -WindowStyle Hidden | Out-Null
}

Write-Host "===================================="
Write-Host "Workhorse IDE - Startup"
Write-Host "===================================="

Start-OllamaIfNeeded
Start-NodeBackendIfNeeded
Start-PythonBackendIfNeeded

$maxAttempts = 12
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $ollamaOk = Test-TcpPort -Port 11434
    $nodeOk = Test-TcpPort -Port 3001
    $pythonOk = Test-TcpPort -Port 8888

    if ($ollamaOk -and $nodeOk -and $pythonOk) {
        Write-Host "[SUCCESS] All services are running"
        exit 0
    }

    Start-Sleep -Seconds 1
}

Write-Host "[WARN] Some services are still starting or failed to start"
Write-Host "Run .\\verify-services.bat for details"
exit 1