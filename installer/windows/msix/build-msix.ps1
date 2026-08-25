[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$PayloadRoot,
    [Parameter(Mandatory)] [string]$OutputDirectory,
    [Parameter(Mandatory)] [string]$Version,
    [string]$Publisher = 'CN=TPC Global LLC',
    [switch]$DevelopmentSign,
    [string]$PfxPath
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = (Resolve-Path -LiteralPath $PayloadRoot).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$Layout = Join-Path $OutputDirectory 'layout'
$PackagePath = Join-Path $OutputDirectory 'OBS-Creator-Assistant-MSIX-Test.msix'
$externalCertificate = $null

if ($DevelopmentSign -and $PfxPath) {
    throw 'Choose either a disposable development certificate or a local PFX, not both.'
}
if ($PfxPath) {
    $PfxPath = (Resolve-Path -LiteralPath $PfxPath).Path
    try {
        $externalCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
            $PfxPath,
            '',
            [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
        )
    } catch {
        throw 'The local PFX could not be opened without a password. Import it into your user certificate store and sign by thumbprint instead.'
    }
    if (-not $externalCertificate.HasPrivateKey) { throw 'The local PFX does not contain a private signing key.' }
    $codeSigningOid = '1.3.6.1.5.5.7.3.3'
    $hasCodeSigningUsage = $externalCertificate.Extensions | Where-Object {
        $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] -and
        $_.EnhancedKeyUsages.Value -contains $codeSigningOid
    }
    if (-not $hasCodeSigningUsage) { throw 'The local PFX is not authorized for code signing.' }
    $Publisher = $externalCertificate.Subject
}

if ($Version -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') {
    throw 'Version must contain three or four numeric components.'
}
$PackageVersion = if (($Version -split '\.').Count -eq 3) { "$Version.0" } else { $Version }

$required = @(
    'helper\OBS-Creator-Assistant.exe',
    'helper\runtime\node.exe',
    'helper\dist\bootstrap.js',
    'plugin\obs-creator-assistant.dll',
    'plugin\en-US.ini',
    'plugin\manifest.json'
)
foreach ($relativePath in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $PayloadRoot $relativePath))) {
        throw "Missing MSIX payload file: $relativePath"
    }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
if (Test-Path -LiteralPath $Layout) { Remove-Item -LiteralPath $Layout -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Layout 'app') -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $PayloadRoot 'helper') -Force |
    Copy-Item -Destination (Join-Path $Layout 'app') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $Layout 'app\OBS-Creator-Assistant.exe') `
    -Destination (Join-Path $Layout 'app\OBS-Creator-Assistant-Background.exe') -Force

# This VFS placement is intentional for the feasibility test. An externally launched,
# unpackaged OBS process is not expected to see another package's virtualized files.
$pluginRoot = Join-Path $Layout 'VFS\Common AppData\obs-studio\plugins\obs-creator-assistant'
New-Item -ItemType Directory -Path (Join-Path $pluginRoot 'bin\64bit') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $pluginRoot 'data\locale') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PayloadRoot 'plugin\obs-creator-assistant.dll') -Destination (Join-Path $pluginRoot 'bin\64bit')
Copy-Item -LiteralPath (Join-Path $PayloadRoot 'plugin\en-US.ini') -Destination (Join-Path $pluginRoot 'data\locale')
Copy-Item -LiteralPath (Join-Path $PayloadRoot 'plugin\manifest.json') -Destination (Join-Path $pluginRoot 'data')

$manifest = (Get-Content -Raw -LiteralPath (Join-Path $ScriptRoot 'AppxManifest.template.xml'))
$manifest = $manifest.Replace('__VERSION__', $PackageVersion).Replace('__PUBLISHER__', $Publisher)
Set-Content -LiteralPath (Join-Path $Layout 'AppxManifest.xml') -Value $manifest -Encoding UTF8

Add-Type -AssemblyName System.Drawing
function New-TestLogo([string]$Path, [int]$Size) {
    $bitmap = [Drawing.Bitmap]::new($Size, $Size)
    try {
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([Drawing.Color]::FromArgb(17, 24, 39))
            $brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(34, 197, 94))
            try { $graphics.FillEllipse($brush, $Size * 0.2, $Size * 0.2, $Size * 0.6, $Size * 0.6) }
            finally { $brush.Dispose() }
        } finally { $graphics.Dispose() }
        $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
}
$assets = Join-Path $Layout 'Assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
New-TestLogo (Join-Path $assets 'StoreLogo.png') 50
New-TestLogo (Join-Path $assets 'Square44x44Logo.png') 44
New-TestLogo (Join-Path $assets 'Square150x150Logo.png') 150

function Find-WindowsSdkTool([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
    if ($command) { return $command }
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $candidate = Get-ChildItem -LiteralPath $sdkRoot -Filter $Name -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object FullName -Match '\\x64\\' | Sort-Object FullName -Descending | Select-Object -ExpandProperty FullName -First 1
    if (-not $candidate) { throw "$Name was not found. Install the Windows 10 or 11 SDK." }
    return $candidate
}

$makeAppx = Find-WindowsSdkTool 'MakeAppx.exe'
if (Test-Path -LiteralPath $PackagePath) { Remove-Item -LiteralPath $PackagePath -Force }
& $makeAppx pack /d $Layout /p $PackagePath /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with exit code $LASTEXITCODE." }

if ($DevelopmentSign) {
    $certificate = New-SelfSignedCertificate -Type Custom -KeyUsage DigitalSignature `
        -Subject $Publisher -CertStoreLocation 'Cert:\CurrentUser\My' -HashAlgorithm SHA256 `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}') `
        -FriendlyName 'OBS Creator Assistant MSIX Test'
    try {
        Export-Certificate -Cert $certificate -FilePath (Join-Path $OutputDirectory 'OBS-Creator-Assistant-MSIX-Test.cer') | Out-Null
        $signTool = Find-WindowsSdkTool 'SignTool.exe'
        & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint $PackagePath
        if ($LASTEXITCODE -ne 0) { throw "SignTool failed with exit code $LASTEXITCODE." }
    } finally {
        Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force
    }
}
elseif ($externalCertificate) {
    $signTool = Find-WindowsSdkTool 'SignTool.exe'
    & $signTool sign /fd SHA256 /f $PfxPath $PackagePath
    if ($LASTEXITCODE -ne 0) { throw "SignTool failed with exit code $LASTEXITCODE." }
    [IO.File]::WriteAllBytes(
        (Join-Path $OutputDirectory 'OBS-Creator-Assistant-MSIX-Test.cer'),
        $externalCertificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    )
    $externalCertificate.Dispose()
}

Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256 |
    ForEach-Object { "$($_.Hash.ToLower())  $([IO.Path]::GetFileName($PackagePath))" } |
    Set-Content -LiteralPath "$PackagePath.sha256" -Encoding ASCII
Write-Output $PackagePath
