[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRoot = Join-Path $env:ProgramData 'obs-studio\plugins\obs-creator-assistant'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    exit $process.ExitCode
}

if (Get-Process -Name 'obs64' -ErrorAction SilentlyContinue) {
    throw 'Close OBS Studio before installing the Creator Assistant plugin.'
}

$pluginDll = Get-ChildItem -LiteralPath $PackageRoot -Filter 'obs-creator-assistant.dll' -File -Recurse |
    Select-Object -First 1

if (-not $pluginDll) {
    throw 'The package does not contain obs-creator-assistant.dll. Download the complete Windows x64 release.'
}

$binRoot = Join-Path $PluginRoot 'bin\64bit'
$localeRoot = Join-Path $PluginRoot 'data\locale'
New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
New-Item -ItemType Directory -Path $localeRoot -Force | Out-Null

Copy-Item -LiteralPath $pluginDll.FullName -Destination (Join-Path $binRoot 'obs-creator-assistant.dll') -Force

$locale = Get-ChildItem -LiteralPath $PackageRoot -Filter 'en-US.ini' -File -Recurse |
    Where-Object { $_.FullName -match '[\\/]locale[\\/]' } |
    Select-Object -First 1
if ($locale) {
    Copy-Item -LiteralPath $locale.FullName -Destination (Join-Path $localeRoot 'en-US.ini') -Force
}

$manifest = Get-ChildItem -LiteralPath $PackageRoot -Filter 'manifest.json' -File -Recurse |
    Select-Object -First 1
if ($manifest) {
    Copy-Item -LiteralPath $manifest.FullName -Destination (Join-Path $PluginRoot 'data\manifest.json') -Force
}

Write-Host ''
Write-Host 'OBS Creator Assistant was installed successfully.' -ForegroundColor Green
Write-Host 'Restart OBS, then open Docks > OBS Creator Assistant.'
