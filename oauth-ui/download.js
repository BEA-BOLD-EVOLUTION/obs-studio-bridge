export const defaultReleaseDownloadUrl =
  "https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge/releases/latest/download/OBS-Creator-Assistant-Setup.exe";

export const releaseStatusUrl =
  "https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge#release-status";

export async function signedInstallerAvailable(
  downloadUrl = defaultReleaseDownloadUrl,
  fetchImpl = fetch
) {
  try {
    const response = await fetchImpl(downloadUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function installerUnavailableHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Windows installer unavailable | OBS Creator Assistant</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f7f7;background:#09090b}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#22222a 0,#09090b 55%)}main{width:min(680px,100%);background:rgba(24,24,28,.92);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:clamp(28px,6vw,52px);box-shadow:0 24px 80px rgba(0,0,0,.4)}.eyebrow{font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:#c9a85c;font-weight:700}h1{font-size:clamp(2rem,7vw,3.4rem);line-height:1.05;margin:14px 0 18px}p{color:#bbb;line-height:1.65;font-size:1.05rem}.status{display:inline-flex;align-items:center;gap:8px;color:#f0c56a;font-weight:700;margin:8px 0 4px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:30px 0 18px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:14px 22px;font-weight:700;text-decoration:none}.primary{background:#f7f7f7;color:#111}.secondary{border:1px solid rgba(255,255,255,.16);color:#f7f7f7}.note{font-size:.9rem;color:#888;margin:0}
</style>
</head>
<body><main>
<div class="eyebrow">Bold Evolution Agency</div>
<div class="status">● Signing in progress</div>
<h1>The Windows installer is temporarily unavailable.</h1>
<p>There is no approved signed installer to download yet. The older source ZIP is not the Creator Assistant desktop helper and will not complete setup in OBS.</p>
<p>We will enable this button automatically after the signed installer is published and verified.</p>
<div class="actions">
<a class="primary" href="/">Back to Creator Assistant</a>
<a class="secondary" href="${releaseStatusUrl}">View release status</a>
</div>
<p class="note">For your security, unsigned installers and temporary build artifacts are not offered here.</p>
</main></body></html>`;
}
