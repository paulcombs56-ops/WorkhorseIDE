# Workhorse IDE - AI Endpoint Smoke Test (Windows)
# Validates end-to-end AI routes via Node proxy.

$ErrorActionPreference = 'Stop'

$allOk = $true

function Get-BooleanEnv {
    param(
        [string]$Name,
        [bool]$Default = $false
    )

    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $Default
    }

    return @('1', 'true', 'yes', 'on') -contains $raw.Trim().ToLowerInvariant()
}

$legacyAiProxyEnabled = Get-BooleanEnv -Name 'ENABLE_LEGACY_AI_PROXY' -Default $true
$assertLegacyDisabled = Get-BooleanEnv -Name 'SMOKE_ASSERT_LEGACY_DISABLED' -Default $false
$runLegacyPositiveChecks = $legacyAiProxyEnabled -and (-not $assertLegacyDisabled)

function Test-Endpoint {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    try {
        & $Action | Out-Null
        Write-Host "[OK]  $Name"
    }
    catch {
        Write-Host "[FAIL] $Name"
        Write-Host "       $($_.Exception.Message)"
        $script:allOk = $false
    }
}

Write-Host "===================================="
Write-Host "Workhorse IDE - AI Smoke Test"
Write-Host "===================================="
Write-Host ""

Test-Endpoint -Name "Node backend health (GET /api/hello)" -Action {
    $res = Invoke-RestMethod -Uri "http://localhost:3001/api/hello" -Method Get
    if (-not $res.message) { throw "Missing message field in /api/hello response" }
}

if ($assertLegacyDisabled) {
    Test-Endpoint -Name "Legacy route disabled expectation (GET /ai/health -> 404)" -Action {
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:3001/ai/health" -Method Get -UseBasicParsing
            throw "Expected /ai/health to return 404, but request succeeded"
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }

            if ($statusCode -ne 404) {
                throw "Expected HTTP 404 from /ai/health, got '$statusCode'"
            }
        }
    }
}
elseif ($runLegacyPositiveChecks) {
    Test-Endpoint -Name "AI backend proxy health (GET /ai/health)" -Action {
        $res = Invoke-RestMethod -Uri "http://localhost:3001/ai/health" -Method Get
        if ($res.status -ne "ok") { throw "Unexpected status from /ai/health: $($res.status)" }
    }

    Test-Endpoint -Name "Legacy proxy deprecation headers (GET /ai/health)" -Action {
        $res = Invoke-WebRequest -Uri "http://localhost:3001/ai/health" -Method Get -UseBasicParsing
        $dep = [string]($res.Headers['Deprecation'])
        $sunset = [string]($res.Headers['Sunset'])
        $link = [string]($res.Headers['Link'])
        if ($dep -ne 'true') { throw "Expected Deprecation=true, got '$dep'" }
        if ([string]::IsNullOrWhiteSpace($sunset)) { throw "Missing Sunset header" }
        if (-not $link.Contains('/api/ai')) { throw "Expected Link header to point to /api/ai" }
    }
}
else {
    Write-Host "[SKIP] Legacy /ai/* tests skipped (ENABLE_LEGACY_AI_PROXY=false)"
}

Test-Endpoint -Name "Provider chain health (GET /api/ai/health)" -Action {
    $res = Invoke-RestMethod -Uri "http://localhost:3001/api/ai/health" -Method Get
    if (-not $res.status) { throw "Missing status field in /api/ai/health response" }
    if ($null -eq $res.providers) { throw "Missing providers field in /api/ai/health response" }
}

if ($runLegacyPositiveChecks) {
    Test-Endpoint -Name "Analyze endpoint (POST /ai/analyze)" -Action {
        $body = @{
            code = "def add(a,b):`n    return a+b`n`nprint(add(2,3))"
            language = "python"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "http://localhost:3001/ai/analyze" -Method Post -ContentType "application/json" -Body $body

        if ($null -eq $res.issues) { throw "Missing issues field" }
        if ($null -eq $res.suggestions) { throw "Missing suggestions field" }
    }

    Test-Endpoint -Name "Refactor endpoint (POST /ai/refactor)" -Action {
        $body = @{
            code = "if result == True:`n    print('success')"
            language = "python"
            refactor_type = "simplify"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "http://localhost:3001/ai/refactor" -Method Post -ContentType "application/json" -Body $body

        if (-not $res.refactored_code) { throw "Missing refactored_code field" }
        if (-not $res.explanation) { throw "Missing explanation field" }
    }

    Test-Endpoint -Name "Docs endpoint (POST /ai/generate-docs)" -Action {
        $body = @{
            code = "def area(r):`n    return 3.14 * r * r"
            language = "python"
            style = "google"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "http://localhost:3001/ai/generate-docs" -Method Post -ContentType "application/json" -Body $body

        if (-not $res.documentation) { throw "Missing documentation field" }
    }
}
elseif ($assertLegacyDisabled) {
    Write-Host "[SKIP] Legacy /ai/* endpoint tests skipped (SMOKE_ASSERT_LEGACY_DISABLED=true)"
}

Test-Endpoint -Name "Provider chain completion (POST /api/ai)" -Action {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/ai/health" -Method Get
    $availableProviders = @($health.providers | Where-Object { $_.available -eq $true })

    if ($availableProviders.Count -eq 0) {
        Write-Host "[SKIP] Provider completion skipped (no configured providers)"
        return
    }

    $body = @{
        prompt = "Reply with exactly: smoke ok"
        model = "llama3"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "http://localhost:3001/api/ai" -Method Post -ContentType "application/json" -Body $body

    if (-not $res.source) { throw "Missing source field" }
    if (-not $res.response) { throw "Missing response field" }
}

Write-Host ""
if ($allOk) {
    Write-Host "[SUCCESS] AI smoke test passed"
    exit 0
}

Write-Host "[ERROR] AI smoke test failed"
exit 1
