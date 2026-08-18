[CmdletBinding()]
param(
    [ValidateSet('AtLogon','Daily')]
    [string]$Schedule = 'AtLogon',
    [string]$DailyTime = '09:00'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$UpdaterPath = Join-Path $ProjectRoot 'update-bridge.ps1'
$TaskName = 'OBS Studio Bridge Auto Update'

if (-not (Test-Path -LiteralPath $UpdaterPath)) {
    throw "Updater script not found at $UpdaterPath"
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$UpdaterPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $ProjectRoot

if ($Schedule -eq 'AtLogon') {
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $scheduleDescription = 'at Windows sign-in'
} else {
    $parsedTime = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($DailyTime, 'HH:mm', $null, [Globalization.DateTimeStyles]::None, [ref]$parsedTime)) {
        throw 'DailyTime must use 24-hour HH:mm format, for example 09:00 or 18:30.'
    }
    $trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime
    $scheduleDescription = "daily at $DailyTime"
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Updates, type-checks, builds, health-checks, and safely restarts the local OBS Studio MCP bridge. Rolls back if an update fails.' `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' ($scheduleDescription)."
Write-Host 'The updater will only accept fast-forward updates from origin/main and will roll back if build or health checks fail.'
