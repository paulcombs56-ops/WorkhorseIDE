# Workhorse IDE - Agent Endpoint Verification (Windows)
# Validates /api/agent model selection contract, metadata propagation, and safety checks.

$ErrorActionPreference = 'Stop'
$allOk = $true

$baseUrl = 'http://localhost:3001/api/agent'
$providerHealthUrl = 'http://localhost:3001/api/ai/health'

$headers = @{}
$token = [Environment]::GetEnvironmentVariable('WORKHORSE_API_TOKEN')
if (-not [string]::IsNullOrWhiteSpace($token)) {
    $headers['x-workhorse-token'] = $token.Trim()
}

function ConvertFrom-JsonSafe {
    param([string]$Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return $null
    }

    try {
        return $Content | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Payload = $null,
        [hashtable]$RequestHeaders = $null
    )

    $localHeaders = @{}
    if ($RequestHeaders) {
        foreach ($k in $RequestHeaders.Keys) {
            $localHeaders[$k] = $RequestHeaders[$k]
        }
    }

    $contentType = $null
    $body = $null
    if ($null -ne $Payload) {
        $contentType = 'application/json'
        $body = $Payload | ConvertTo-Json -Depth 50
    }

    try {
        $response = Invoke-WebRequest -Method $Method -Uri $Url -Headers $localHeaders -UseBasicParsing -ContentType $contentType -Body $body -TimeoutSec 30
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Json = ConvertFrom-JsonSafe -Content ([string]$response.Content)
            Raw = [string]$response.Content
        }
    }
    catch {
        $status = -1
        $raw = ''

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode.value__
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                $raw = [string]$_.ErrorDetails.Message
            }
        }

        return [pscustomobject]@{
            StatusCode = $status
            Json = ConvertFrom-JsonSafe -Content $raw
            Raw = $raw
            Error = $_.Exception.Message
        }
    }
}

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

function Assert-Status {
    param(
        [pscustomobject]$Response,
        [int]$Expected,
        [string]$Context
    )

    if ($Response.StatusCode -ne $Expected) {
        throw "$Context expected HTTP $Expected, got $($Response.StatusCode). Body: $($Response.Raw)"
    }
}

Write-Host '===================================='
Write-Host 'Workhorse IDE - Agent API Verify'
Write-Host '===================================='
Write-Host ''

Test-Endpoint -Name 'Consult accepts auto model and returns model metadata' -Action {
    $res = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/consult" -RequestHeaders $headers -Payload @{
        prompt = 'Quick sanity check for consult.'
        context = ''
        preferred_model = 'auto'
    }

    Assert-Status -Response $res -Expected 200 -Context 'POST /api/agent/consult'
    if (-not $res.Json) { throw 'Consult response is not JSON' }
    if ([string]::IsNullOrWhiteSpace([string]$res.Json.source)) { throw 'Missing source field' }
    if ([string]::IsNullOrWhiteSpace([string]$res.Json.model_selection_mode)) { throw 'Missing model_selection_mode field' }
    if (-not $res.Json.PSObject.Properties.Match('requested_model')) { throw 'Missing requested_model field' }
}

Test-Endpoint -Name 'Consult rejects invalid preferred_model with HTTP 400' -Action {
    $res = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/consult" -RequestHeaders $headers -Payload @{
        prompt = 'invalid model test'
        preferred_model = 'claude-not-real'
    }

    Assert-Status -Response $res -Expected 400 -Context 'POST /api/agent/consult invalid model'
}

Test-Endpoint -Name 'Consult accepts all explicit Claude models' -Action {
    $models = @('claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5')
    foreach ($m in $models) {
        $res = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/consult" -RequestHeaders $headers -Payload @{
            prompt = "explicit model test for $m"
            preferred_model = $m
        }
        Assert-Status -Response $res -Expected 200 -Context "POST /api/agent/consult explicit model $m"
        if (-not $res.Json) { throw "Response for $m is not JSON" }
        if ([string]$res.Json.requested_model -ne $m) {
            throw "requested_model mismatch for ${m}: got '$($res.Json.requested_model)'"
        }
    }
}

Test-Endpoint -Name 'Search endpoint carries preferred_model metadata' -Action {
    $query = [uri]::EscapeDataString('config')
    $res = Invoke-JsonRequest -Method 'GET' -Url "$baseUrl/search?q=$query&preferred_model=auto" -RequestHeaders $headers
    Assert-Status -Response $res -Expected 200 -Context 'GET /api/agent/search'
    if ([string]$res.Json.requested_model -ne 'auto') { throw "Expected requested_model=auto, got '$($res.Json.requested_model)'" }
    if ($null -eq $res.Json.matches) { throw 'Missing matches field' }
}

Test-Endpoint -Name 'Undo history endpoint carries preferred_model metadata' -Action {
    $res = Invoke-JsonRequest -Method 'GET' -Url "$baseUrl/undo/history?preferred_model=auto" -RequestHeaders $headers
    Assert-Status -Response $res -Expected 200 -Context 'GET /api/agent/undo/history'
    if ([string]$res.Json.requested_model -ne 'auto') { throw "Expected requested_model=auto, got '$($res.Json.requested_model)'" }
    if ($null -eq $res.Json.entries) { throw 'Missing entries field' }
}

Test-Endpoint -Name 'Forge and Undo include preferred_model metadata' -Action {
    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $tempPath = ".workhorse/agent-model-verify-temp-$suffix.txt"
    $forgeRes = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/forge" -RequestHeaders $headers -Payload @{
        summary = 'Model metadata verification temp operation'
        preferred_model = 'auto'
        operations = @(
            @{
                op = 'create'
                path = $tempPath
                content = 'temporary verification content'
            }
        )
    }

    Assert-Status -Response $forgeRes -Expected 200 -Context 'POST /api/agent/forge'
    if ([string]$forgeRes.Json.requested_model -ne 'auto') { throw "Expected forge requested_model=auto, got '$($forgeRes.Json.requested_model)'" }

    $undoId = [string]$forgeRes.Json.undoId
    if ([string]::IsNullOrWhiteSpace($undoId)) {
        throw "Forge response missing undoId for temp operation. successCount=$($forgeRes.Json.successCount) failureCount=$($forgeRes.Json.failureCount)"
    }

    $undoRes = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/undo" -RequestHeaders $headers -Payload @{
        undoId = $undoId
        preferred_model = 'auto'
    }

    Assert-Status -Response $undoRes -Expected 200 -Context 'POST /api/agent/undo'
    if ([string]$undoRes.Json.requested_model -ne 'auto') { throw "Expected undo requested_model=auto, got '$($undoRes.Json.requested_model)'" }
}

Test-Endpoint -Name 'Auto complexity routing tiers when Claude is available' -Action {
    $healthRes = Invoke-JsonRequest -Method 'GET' -Url $providerHealthUrl -RequestHeaders $headers
    Assert-Status -Response $healthRes -Expected 200 -Context 'GET /api/ai/health'

    $claudeAvailable = $false
    if ($healthRes.Json -and $healthRes.Json.providers) {
        $claude = $healthRes.Json.providers | Where-Object { [string]$_.name -eq 'claude' } | Select-Object -First 1
        if ($claude -and $claude.available -eq $true) {
            $claudeAvailable = $true
        }
    }

    if (-not $claudeAvailable) {
        Write-Host '[SKIP] Claude not available; skipping complexity routing assertions.'
        return
    }

    $cases = @(
        @{
            Name = 'low'
            Prompt = 'Rename foo.js to bar.js.'
            Expected = 'claude-haiku-4-5'
        },
        @{
            Name = 'medium'
            Prompt = ('Create a migration plan for three files with validation and tests. ' * 20)
            Expected = 'claude-sonnet-4-6'
        },
        @{
            Name = 'high'
            Prompt = 'Refactor architecture across multiple modules, preserve behavior, add regression tests, provide rollback strategy, include dependency updates, and outline phased deployment with observability checks.'
            Expected = 'claude-opus-4-6'
        }
    )

    foreach ($case in $cases) {
        $res = Invoke-JsonRequest -Method 'POST' -Url "$baseUrl/consult" -RequestHeaders $headers -Payload @{
            prompt = $case.Prompt
            preferred_provider = 'claude'
            preferred_model = 'auto'
        }

        Assert-Status -Response $res -Expected 200 -Context "Auto routing case $($case.Name)"
        if ([string]$res.Json.source -ne 'claude') {
            throw "Expected source=claude for auto routing case $($case.Name), got '$($res.Json.source)'"
        }
        if ([string]$res.Json.effective_model -ne [string]$case.Expected) {
            throw "Expected effective_model=$($case.Expected) for case $($case.Name), got '$($res.Json.effective_model)'"
        }
        if ([string]$res.Json.model_selection_mode -ne 'auto') {
            throw "Expected model_selection_mode=auto for case $($case.Name), got '$($res.Json.model_selection_mode)'"
        }
    }
}

Write-Host ''
if ($allOk) {
    Write-Host '[SUCCESS] Agent endpoint verification passed'
    exit 0
}

Write-Host '[ERROR] Agent endpoint verification failed'
exit 1
