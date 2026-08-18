export function setupPage(options: { obsConnected: boolean; chatgptPluginUrl?: string }): string {
  const { obsConnected, chatgptPluginUrl } = options;
  const obsStatus = obsConnected ? "Connected" : "Not connected";
  const obsClass = obsConnected ? "ok" : "warn";
  const connectAction = chatgptPluginUrl
    ? `<a class="primary" href="/connect-chatgpt">Connect ChatGPT</a>`
    : `<button class="primary" disabled>ChatGPT connection coming soon</button>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>OBS Creator Assistant</title>
<style>
  :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1f1f; background:#f6f6f6; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; box-sizing:border-box; }
  main { width:min(620px,100%); background:white; border:1px solid #dedede; border-radius:20px; padding:32px; box-shadow:0 12px 40px rgba(0,0,0,.08); }
  h1 { margin:0 0 8px; font-size:30px; }
  p { line-height:1.5; color:#555; }
  .status { display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-top:1px solid #eee; }
  .status:last-of-type { border-bottom:1px solid #eee; }
  .ok { color:#176b37; font-weight:700; }
  .warn { color:#8a5a00; font-weight:700; }
  .actions { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }
  a, button { appearance:none; border:0; border-radius:10px; padding:12px 18px; font:inherit; text-decoration:none; cursor:pointer; }
  .primary { background:#1f1f1f; color:white; }
  .secondary { background:#ededed; color:#1f1f1f; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  small { display:block; margin-top:22px; color:#777; line-height:1.45; }
</style>
</head>
<body>
<main>
  <h1>OBS Creator Assistant</h1>
  <p>Your OBS connection is handled automatically. You should never need to copy an MCP URL, token, or configuration file.</p>
  <div class="status"><span>Creator Assistant</span><span class="ok">Running</span></div>
  <div class="status"><span>OBS Studio</span><span class="${obsClass}">${obsStatus}</span></div>
  <div class="actions">
    ${connectAction}
    <a class="secondary" href="/setup">Check again</a>
  </div>
  <small>After ChatGPT is connected, you can ask it to set up your LIVE, share a screen or window, run an AI transition, troubleshoot OBS, or run other creator workflows.</small>
</main>
</body>
</html>`;
}
