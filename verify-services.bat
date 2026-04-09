@echo off
REM Workhorse IDE - Service Verification Script (Windows)
REM Checks if all required services are running and accessible

echo ====================================
echo Workhorse IDE - Service Status Check
echo ====================================
echo.

setlocal enabledelayedexpansion

REM Test results
set OLLAMA_OK=0
set NODE_OK=0
set PYTHON_OK=0
set ALL_OK=1

echo Checking services...
echo.

REM Test Ollama
echo Checking Ollama (http://localhost:11434)...
curl -s http://localhost:11434/api/tags >nul 2>nul
if !errorlevel! EQU 0 (
    echo   [OK] Ollama is Online
    set OLLAMA_OK=1
) else (
    echo   [FAIL] Ollama is Offline
    echo   Fix: Run 'ollama serve' in another terminal
    set ALL_OK=0
)
echo.

REM Test Node Backend
echo Checking Node.js Backend (http://localhost:3001)...
curl -s http://localhost:3001/api/hello >nul 2>nul
if !errorlevel! EQU 0 (
    echo   [OK] Node Backend is Online
    set NODE_OK=1
) else (
    echo   [FAIL] Node Backend is Offline
    echo   Fix: Run 'cd backend ^&^& node app.js' in another terminal
    set ALL_OK=0
)
echo.

REM Test Python AI Backend
echo Checking Python AI Backend (http://localhost:8888)...
curl -s http://localhost:8888/health >nul 2>nul
if !errorlevel! EQU 0 (
    echo   [OK] Python Backend is Online
    set PYTHON_OK=1
) else (
    echo   [FAIL] Python Backend is Offline
    echo   Fix: Run 'cd ai_backend ^&^& python main.py' in another terminal
    set ALL_OK=0
)
echo.

REM Summary
echo ====================================
echo Summary:
echo ====================================

if !OLLAMA_OK!==1 (
    echo Ollama:         [OK]
) else (
    echo Ollama:         [FAIL]
)

if !NODE_OK!==1 (
    echo Node Backend:    [OK]
) else (
    echo Node Backend:    [FAIL]
)

if !PYTHON_OK!==1 (
    echo Python Backend:  [OK]
) else (
    echo Python Backend:  [FAIL]
)

echo.

if "!ALL_OK!"=="1" (
    echo [SUCCESS] All services are running!
    echo.
    echo You can now:
    echo   1. Open http://localhost:3000 in your browser
    echo   2. Click the 'AI Status' button to verify connection
    echo   3. Try the Analyze, Refactor, or Generate Docs buttons
    exit /b 0
) else (
    echo [ERROR] Some services are offline
    echo.
    echo Required startup commands:
    echo   ollama serve
    echo   node backend\app.js
    echo   python ai_backend\main.py
    exit /b 1
)
