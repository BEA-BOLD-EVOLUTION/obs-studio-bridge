[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath '.env')) {
    throw '.env is missing. Run .\setup.ps1 first.'
}

if (-not (Test-Path -LiteralPath 'dist\server.js')) {
    Write-Host 'Build output is missing; building now...'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
}

node dist/server.js
