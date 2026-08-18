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

$PidFile = Join-Path $ProjectRoot '.bridge.pid'
$nodeProcess = $null

try {
    $nodeProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/server.js' -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru
    Set-Content -LiteralPath $PidFile -Value $nodeProcess.Id -Encoding ascii
    Write-Host "OBS bridge started with PID $($nodeProcess.Id)."
    $nodeProcess.WaitForExit()
    exit $nodeProcess.ExitCode
}
finally {
    if (Test-Path -LiteralPath $PidFile) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}
