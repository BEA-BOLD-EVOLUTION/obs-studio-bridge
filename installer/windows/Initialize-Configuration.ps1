[CmdletBinding()]
param(
    [string]$InstallRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $InstallRoot '.env'
$stopPath = Join-Path $InstallRoot '.stop'

if (Test-Path -LiteralPath $stopPath) {
    Remove-Item -LiteralPath $stopPath -Force
}

if (Test-Path -LiteralPath $envPath) {
    Write-Host 'Existing Creator Assistant connection settings were preserved.'
    exit 0
}

function New-RandomToken {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Read-ExampleSetting([string]$Name, [string]$Fallback) {
    $examplePath = Join-Path $InstallRoot '.env.example'
    if (-not (Test-Path -LiteralPath $examplePath)) { return $Fallback }
    $line = Get-Content -LiteralPath $examplePath |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { return $Fallback }
    $value = ($line -split '=', 2)[1].Trim()
    if ($value) { return $value }
    return $Fallback
}

$obsPort = 4455
$obsPassword = ''
$obsConfigPath = Join-Path $env:APPDATA 'obs-studio\plugin_config\obs-websocket\config.json'

if (Test-Path -LiteralPath $obsConfigPath) {
    try {
        $obsConfig = Get-Content -LiteralPath $obsConfigPath -Raw | ConvertFrom-Json
        if ($obsConfig.server_port -as [int]) {
            $candidatePort = [int]$obsConfig.server_port
            if ($candidatePort -gt 0 -and $candidatePort -le 65535) { $obsPort = $candidatePort }
        }
        if ($obsConfig.auth_required -ne $false -and $obsConfig.server_password) {
            $obsPassword = [string]$obsConfig.server_password
        }
        Write-Host 'Detected the local OBS WebSocket settings.'
    }
    catch {
        Write-Warning 'OBS settings were found but could not be read. They can be completed from the setup screen.'
    }
}

$relayUrl = Read-ExampleSetting 'RELAY_URL' 'https://relay-production-bbb4.up.railway.app'
$pluginUrl = Read-ExampleSetting 'CHATGPT_PLUGIN_URL' ''
$envLines = @(
    "OBS_WEBSOCKET_URL=ws://127.0.0.1:$obsPort",
    "OBS_WEBSOCKET_PASSWORD=$obsPassword",
    "BRIDGE_AUTH_TOKEN=$(New-RandomToken)",
    'BRIDGE_PORT=8787',
    'ONBOARDING_PORT=8788',
    "RELAY_URL=$relayUrl",
    "CHATGPT_PLUGIN_URL=$pluginUrl"
)

Set-Content -LiteralPath $envPath -Value $envLines -Encoding UTF8
Write-Host 'Created secure local Creator Assistant settings.'

