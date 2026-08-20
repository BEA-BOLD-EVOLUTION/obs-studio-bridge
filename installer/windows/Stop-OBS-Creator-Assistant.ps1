[CmdletBinding()]
param(
    [string]$InstallRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $InstallRoot '.bridge.pid'
$stopPath = Join-Path $InstallRoot '.stop'
Set-Content -LiteralPath $stopPath -Value 'stop' -Encoding ASCII

if (Test-Path -LiteralPath $pidPath) {
    $pidText = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    $processId = 0
    if ([int]::TryParse($pidText, [ref]$processId)) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            $expectedNode = Join-Path $InstallRoot 'runtime\node.exe'
            if ($process.Path -eq $expectedNode) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                try { Wait-Process -Id $processId -Timeout 5 -ErrorAction SilentlyContinue } catch {}
            }
        }
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}


