import { execFile } from "node:child_process";

type CommandResult = { stdout: string; stderr?: string };
export type CommandRunner = (file: string, args: string[]) => Promise<CommandResult>;

const powershell = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : "powershell.exe";

const inspectScript = String.raw`
$ErrorActionPreference = 'Stop'
$apps = @(Get-StartApps | Where-Object { $_.Name -match 'TikTok.*LIVE Studio|LIVE Studio.*TikTok' })
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match 'TikTok.*(LIVE|Studio)|LIVE.*Studio' -or
  $_.ExecutablePath -match 'TikTok.*LIVE Studio|LIVE Studio.*TikTok'
})
[pscustomobject]@{
  supported = $true
  installed = $apps.Count -gt 0 -or $processes.Count -gt 0
  running = $processes.Count -gt 0
  applications = @($apps | ForEach-Object { [pscustomobject]@{ name = $_.Name; appId = $_.AppID } })
  processes = @($processes | ForEach-Object { [pscustomobject]@{ name = $_.Name; processId = $_.ProcessId } })
} | ConvertTo-Json -Compress -Depth 4
`;

const launchScript = String.raw`
$ErrorActionPreference = 'Stop'
$existing = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match 'TikTok.*(LIVE|Studio)|LIVE.*Studio' -or
  $_.ExecutablePath -match 'TikTok.*LIVE Studio|LIVE Studio.*TikTok'
})
if ($existing.Count -gt 0) {
  [pscustomobject]@{ ok = $true; changed = $false; running = $true; message = 'TikTok LIVE Studio is already running.' } | ConvertTo-Json -Compress
  exit 0
}
$app = Get-StartApps | Where-Object { $_.Name -match 'TikTok.*LIVE Studio|LIVE Studio.*TikTok' } | Select-Object -First 1
if (-not $app) { throw 'TikTok LIVE Studio was not found in the Windows Start menu.' }
Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\' + $app.AppID)
Start-Sleep -Seconds 2
$started = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match 'TikTok.*(LIVE|Studio)|LIVE.*Studio' -or
  $_.ExecutablePath -match 'TikTok.*LIVE Studio|LIVE Studio.*TikTok'
})
[pscustomobject]@{
  ok = $started.Count -gt 0
  changed = $true
  running = $started.Count -gt 0
  application = $app.Name
  message = if ($started.Count -gt 0) { 'TikTok LIVE Studio opened.' } else { 'Windows accepted the launch request, but the app is not visible yet.' }
} | ConvertTo-Json -Compress
`;

const cameraScript = String.raw`
$ErrorActionPreference = 'Stop'
$devices = @(Get-PnpDevice -PresentOnly | Where-Object {
  $_.Class -in @('Camera', 'Image') -and
  $_.Status -eq 'OK' -and
  $_.FriendlyName -notmatch 'scanner|scanservice|officejet|printer|fax'
})
[pscustomobject]@{
  supported = $true
  cameras = @($devices | ForEach-Object {
    [pscustomobject]@{
      name = $_.FriendlyName
      deviceId = $_.InstanceId
      deviceClass = $_.Class
      status = $_.Status
      kind = if ($_.FriendlyName -match 'virtual|OBS Camera|Animaze') { 'virtual' } else { 'physical' }
    }
  })
} | ConvertTo-Json -Compress -Depth 4
`;

function defaultRunner(file: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runPowerShellJson<T>(script: string, runner: CommandRunner): Promise<T> {
  if (process.platform !== "win32" && runner === defaultRunner) {
    throw new Error("This desktop capability is available only on Windows.");
  }
  const { stdout } = await runner(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script]);
  const value = stdout.trim();
  if (!value) throw new Error("Windows returned no desktop integration result.");
  return JSON.parse(value) as T;
}

export async function inspectTikTokLiveStudio(runner: CommandRunner = defaultRunner) {
  return runPowerShellJson(inspectScript, runner);
}

export async function launchTikTokLiveStudio(confirmed: boolean, runner: CommandRunner = defaultRunner) {
  if (confirmed !== true) throw new Error("Explicit creator confirmation is required before opening TikTok LIVE Studio.");
  return runPowerShellJson(launchScript, runner);
}

export async function listWindowsCameraCandidates(runner: CommandRunner = defaultRunner) {
  return runPowerShellJson(cameraScript, runner);
}
