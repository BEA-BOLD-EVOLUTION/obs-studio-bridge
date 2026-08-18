[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Stop-BridgeSafely {
    $pidFile = Join-Path $ProjectRoot '.bridge.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) {
        Write-Host 'No bridge PID file found; assuming the bridge is already stopped.'
        return
    }

    $bridgePidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    $bridgePid = 0
    if (-not [int]::TryParse($bridgePidText, [ref]$bridgePid)) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        Write-Host 'Bridge PID file was invalid and has been removed.'
        return
    }

    $process = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Stopping OBS bridge PID $bridgePid..."
        Stop-Process -Id $bridgePid -Force
        try { Wait-Process -Id $bridgePid -Timeout 10 -ErrorAction SilentlyContinue } catch {}
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Start-BridgeDetached {
    Write-Host 'Starting updated OBS bridge...'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', (Join-Path $ProjectRoot 'start-bridge.ps1')
    ) -WorkingDirectory $ProjectRoot | Out-Null
}

function Wait-ForHealth {
    $envPath = Join-Path $ProjectRoot '.env'
    $port = 8787
    if (Test-Path -LiteralPath $envPath) {
        $portLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^BRIDGE_PORT=' } | Select-Object -First 1
        if ($portLine) {
            $parsed = ($portLine -split '=', 2)[1].Trim()
            $parsedPort = 0
            if ([int]::TryParse($parsed, [ref]$parsedPort) -and $parsedPort -gt 0 -and $parsedPort -le 65535) {
                $port = $parsedPort
            }
        }
    }

    $healthUri = "http://127.0.0.1:$port/health"
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $response = Invoke-RestMethod -Uri $healthUri -Method Get -TimeoutSec 2
            if ($response.ok -eq $true) {
                return $true
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is not installed or is not on PATH.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is not installed or is not on PATH.' }

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect git working tree.' }
if ($status -and -not $Force) {
    throw 'Local changes are present. Commit/stash them first, or rerun with -Force if you intentionally want to update anyway.'
}

$previousSha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to determine current commit.' }

Write-Host "Current commit: $previousSha"
Write-Host 'Checking origin/main...'
Invoke-Checked 'git' @('fetch', 'origin', 'main')
$targetSha = (git rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to determine origin/main commit.' }

if ($previousSha -eq $targetSha -and -not $Force) {
    Write-Host 'OBS bridge is already up to date.'
    if (-not $NoRestart) {
        Stop-BridgeSafely
        Start-BridgeDetached
        if (-not (Wait-ForHealth)) { throw 'Bridge restart failed health check.' }
        Write-Host 'Bridge restarted successfully.'
    }
    exit 0
}

$lockChanged = $false
git diff --quiet $previousSha $targetSha -- package-lock.json pnpm-lock.yaml
if ($LASTEXITCODE -eq 1) {
    $lockChanged = $true
} elseif ($LASTEXITCODE -ne 0) {
    throw 'Unable to compare dependency lockfiles.'
}

Stop-BridgeSafely

try {
    Write-Host "Updating to $targetSha..."
    Invoke-Checked 'git' @('merge', '--ff-only', 'origin/main')

    if ($lockChanged) {
        Write-Host 'Dependency lockfile changed; installing dependencies...'
        if (Test-Path -LiteralPath 'package-lock.json') {
            Invoke-Checked 'npm' @('ci')
        } elseif ((Test-Path -LiteralPath 'pnpm-lock.yaml') -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
            Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
        } else {
            Invoke-Checked 'npm' @('install')
        }
    }

    Write-Host 'Type-checking and building...'
    Invoke-Checked 'npm' @('run', 'check')
    Invoke-Checked 'npm' @('run', 'build')

    if (-not $NoRestart) {
        Start-BridgeDetached
        if (-not (Wait-ForHealth)) {
            throw 'Updated bridge failed its health check.'
        }
        Write-Host 'Update complete. OBS bridge is healthy.'
    } else {
        Write-Host 'Update complete. Restart skipped because -NoRestart was specified.'
    }
}
catch {
    $updateError = $_
    Write-Warning "Update failed: $($updateError.Exception.Message)"
    Write-Warning "Rolling back to $previousSha..."

    try {
        Invoke-Checked 'git' @('reset', '--hard', $previousSha)
        Invoke-Checked 'npm' @('run', 'build')
        if (-not $NoRestart) {
            Start-BridgeDetached
            if (-not (Wait-ForHealth)) {
                throw 'Rollback build started, but the bridge did not pass its health check.'
            }
        }
        Write-Warning 'Rollback succeeded. The previous bridge version has been restored.'
    }
    catch {
        throw "Update failed and rollback also failed. Original error: $($updateError.Exception.Message). Rollback error: $($_.Exception.Message)"
    }

    throw $updateError
}
