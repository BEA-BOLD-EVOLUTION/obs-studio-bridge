[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TunnelRoot = Join-Path $ProjectRoot 'tunnel-client'
$TunnelClient = Join-Path $TunnelRoot 'tunnel-client.exe'
$Profile = Join-Path $TunnelRoot 'obs-studio.yaml'
$RuntimeKey = Join-Path $TunnelRoot 'control-plane-api-key.txt'

if (-not (Test-Path -LiteralPath $TunnelClient)) {
    throw 'tunnel-client.exe is missing.'
}

if (-not (Test-Path -LiteralPath $RuntimeKey) -or
    [string]::IsNullOrWhiteSpace((Get-Content -Raw -LiteralPath $RuntimeKey))) {
    throw 'Paste an OpenAI tunnel runtime API key into tunnel-client\control-plane-api-key.txt first.'
}

& $TunnelClient doctor --profile-file $Profile --explain
if ($LASTEXITCODE -ne 0) { throw 'Tunnel configuration validation failed.' }

& $TunnelClient run --profile-file $Profile
