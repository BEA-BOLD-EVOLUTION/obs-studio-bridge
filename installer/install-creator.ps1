[CmdletBinding()]
param(
    [string]$InstallRoot = "$env:LOCALAPPDATA\OBS Creator Assistant",
    [switch]$NoDesktopShortcut
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path -LiteralPath (Join-Path $ScriptRoot 'dist')) {
    $PackageRoot = $ScriptRoot
} else {
    $PackageRoot = Split-Path -Parent $ScriptRoot
}

function Write-Step([string]$Text) {
    Write-Host "`n$Text" -ForegroundColor Cyan
}

function New-RandomToken {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Find-ObsExecutable {
    $candidates = @(
        "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe",
        "${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe",
        "$env:LOCALAPPDATA\Programs\obs-studio\bin\64bit\obs64.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

function Read-PackageSetting([string]$Name) {
    $examplePath = Join-Path $PackageRoot '.env.example'
    if (-not (Test-Path -LiteralPath $examplePath)) { return '' }
    $line = Get-Content -LiteralPath $examplePath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) { return '' }
    return ($line -split '=', 2)[1].Trim()
}

Write-Host 'OBS Creator Assistant' -ForegroundColor White
Write-Host 'Creator-friendly setup for OBS automation.' -ForegroundColor DarkGray

Write-Step '1 of 5  Checking OBS Studio'
$obsExe = Find-ObsExecutable
if ($obsExe) {
    Write-Host "OBS Studio found: $obsExe" -ForegroundColor Green
} else {
    Write-Warning 'OBS Studio was not found. The assistant can still be installed, but OBS must be installed before it can connect.'
}

Write-Step '2 of 5  Installing Creator Assistant'
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$itemsToCopy = @('dist','node_modules','package.json','.env.example','start-bridge.ps1','update-bridge.ps1')
foreach ($item in $itemsToCopy) {
    $source = Join-Path $PackageRoot $item
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination $InstallRoot -Recurse -Force
    }
}

$bundledNode = Join-Path $PackageRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $bundledNode)) {
    throw 'This package is missing its bundled Node runtime. Download a complete Creator Assistant release package.'
}
New-Item -ItemType Directory -Path (Join-Path $InstallRoot 'runtime') -Force | Out-Null
Copy-Item -LiteralPath $bundledNode -Destination (Join-Path $InstallRoot 'runtime\node.exe') -Force

Write-Step '3 of 5  Creating a secure local connection'
$envPath = Join-Path $InstallRoot '.env'
$token = New-RandomToken
$chatgptPluginUrl = Read-PackageSetting 'CHATGPT_PLUGIN_URL'
$envLines = @(
    'BRIDGE_PORT=8787',
    'OBS_WEBSOCKET_URL=ws://127.0.0.1:4455',
    'OBS_WEBSOCKET_PASSWORD=',
    "BRIDGE_AUTH_TOKEN=$token",
    "CHATGPT_PLUGIN_URL=$chatgptPluginUrl"
)
Set-Content -LiteralPath $envPath -Value $envLines -Encoding UTF8

$setupTemplate = Join-Path $PackageRoot 'creator-setup.html'
if (-not (Test-Path -LiteralPath $setupTemplate)) {
    $setupTemplate = Join-Path $PackageRoot 'installer\creator-setup.html'
}
if (-not (Test-Path -LiteralPath $setupTemplate)) {
    throw 'Creator onboarding page is missing from this release package.'
}
$setupHtml = Get-Content -LiteralPath $setupTemplate -Raw
$setupHtml = $setupHtml.Replace('__CHATGPT_PLUGIN_URL__', $chatgptPluginUrl)
$setupPagePath = Join-Path $InstallRoot 'OBS Creator Assistant.html'
Set-Content -LiteralPath $setupPagePath -Value $setupHtml -Encoding UTF8

$launcher = @"
@echo off
cd /d "$InstallRoot"
"$InstallRoot\runtime\node.exe" "$InstallRoot\dist\server.js"
"@
Set-Content -LiteralPath (Join-Path $InstallRoot 'OBS Creator Assistant.cmd') -Value $launcher -Encoding ASCII

Write-Step '4 of 5  Starting automatically with Windows'
$taskName = 'OBS Creator Assistant'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$InstallRoot\OBS Creator Assistant.cmd`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts OBS Creator Assistant when the user signs in.' -Force | Out-Null

if (-not $NoDesktopShortcut) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'OBS Creator Assistant.lnk'
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $setupPagePath
    $shortcut.WorkingDirectory = $InstallRoot
    $shortcut.Description = 'Open OBS Creator Assistant'
    $shortcut.Save()
}

Start-ScheduledTask -TaskName $taskName

Write-Step '5 of 5  Testing the connection'
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -Method Get -TimeoutSec 2
        if ($health.ok -eq $true) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}

$config = [ordered]@{
    installed = $true
    installRoot = $InstallRoot
    obsDetected = [bool]$obsExe
    obsPath = $obsExe
    bridgeHealthy = $healthy
    chatgptConfigured = [bool]$chatgptPluginUrl
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot 'connection.json') -Encoding UTF8

Write-Host ''
if ($healthy) {
    Write-Host 'Setup complete. OBS Creator Assistant is running.' -ForegroundColor Green
} else {
    Write-Warning 'Creator Assistant is installed, but OBS is not connected yet. Open OBS Studio, then open OBS Creator Assistant from your desktop.'
}
Start-Process $setupPagePath
