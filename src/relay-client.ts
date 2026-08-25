import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import WebSocket from "ws";
import { isRemoteToolAllowed } from "./remote-tools.js";
import { applyCreatorSetup } from "./clipper-server.js";
import { readCreatorSetup, writeCreatorSetup } from "./setup-config.js";

const relayBaseUrl = (process.env.RELAY_URL?.trim() || "https://relay-production-bbb4.up.railway.app").replace(/\/$/, "");
const bridgePort = Number.parseInt(process.env.BRIDGE_PORT || "8787", 10) || 8787;
const bridgeToken = process.env.BRIDGE_AUTH_TOKEN?.trim() || "";
const chatgptPluginUrl = process.env.CHATGPT_PLUGIN_URL?.trim() || "";
const safeChatgptPluginUrl = safeHttpsUrl(chatgptPluginUrl);
const onboardingPort = Number.parseInt(process.env.ONBOARDING_PORT || "8788", 10) || 8788;
const deviceStatePath = path.join(process.cwd(), ".device.json");

type DeviceState = {
  deviceId: string;
  deviceSecret: string;
  pairingCode: string;
  expiresAt: string;
};

let currentState: DeviceState | null = null;
let socket: WebSocket | null = null;
let stopped = false;
let onboardingServer: http.Server | null = null;

function safeHttpsUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch { return ""; }
}

async function readDeviceState(): Promise<DeviceState | null> {
  try {
    const raw = await fs.readFile(deviceStatePath, "utf8");
    return JSON.parse(raw) as DeviceState;
  } catch {
    return null;
  }
}

async function registerDevice(): Promise<DeviceState> {
  const response = await fetch(`${relayBaseUrl}/v1/devices/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceName: os.hostname() })
  });
  if (!response.ok) throw new Error(`Device registration failed (${response.status}).`);
  const state = await response.json() as DeviceState;
  await fs.writeFile(deviceStatePath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  return state;
}

async function ensureDeviceState(): Promise<DeviceState> {
  const saved = await readDeviceState();
  if (saved?.deviceId && saved?.deviceSecret) {
    currentState = saved;
    return saved;
  }
  currentState = await registerDevice();
  return currentState;
}

async function callLocalTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  if (!isRemoteToolAllowed(tool)) throw new Error(`Remote tool '${tool}' is not allowlisted by the local companion.`);
  if (!bridgeToken) throw new Error("Local bridge token is missing.");

  const client = new Client({ name: "obs-creator-assistant-relay-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${bridgePort}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${bridgeToken}` } } }
  );
  try {
    await client.connect(transport);
    return await client.callTool({ name: tool, arguments: args });
  } finally {
    await client.close().catch(() => undefined);
  }
}

function websocketUrl(state: DeviceState): string {
  const base = relayBaseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const url = new URL(`${base}/v1/device-connect`);
  url.searchParams.set("deviceId", state.deviceId);
  url.searchParams.set("secret", state.deviceSecret);
  return url.toString();
}

export function onboardingHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set Up Creator Assistant</title><style>
*{box-sizing:border-box}body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:#101114;color:#f7f7f8;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.shell{width:min(720px,100%);background:#1a1c21;border:1px solid #30333a;border-radius:22px;overflow:hidden;box-shadow:0 24px 80px #0008}.top{padding:28px 32px 18px;border-bottom:1px solid #30333a}.top small{color:#9da3ae}.progress{height:4px;background:#30333a;margin-top:20px}.progress i{display:block;height:100%;background:#7c5cff;width:25%;transition:.25s}main{padding:32px}h1{font-size:28px;margin:0 0 10px}h2{font-size:21px;margin:24px 0 10px}p{color:#b9bec8;line-height:1.55}.checks,.choices{display:grid;gap:10px;margin:22px 0}.check,.choice{padding:15px 16px;border:1px solid #353941;border-radius:12px;background:#202329}.check{display:flex;justify-content:space-between}.ok{color:#56d68b;font-weight:700}.wait{color:#f0bd5b;font-weight:700}.choice{cursor:pointer;display:flex;gap:12px;align-items:flex-start}.choice:has(input:checked){border-color:#8b73ff;background:#27233b}.choice strong{display:block}.choice span{display:block;color:#aeb4bf;font-size:14px;margin-top:3px}input{accent-color:#8b73ff}.actions{display:flex;justify-content:space-between;gap:12px;margin-top:28px}button,a.button{border:0;border-radius:11px;padding:12px 18px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{background:#8066ff;color:#fff}.secondary{background:#30333a;color:#fff}.primary:disabled{opacity:.45;cursor:not-allowed}.hidden{display:none!important}.code{font-size:38px;letter-spacing:7px;text-align:center;font-weight:800;background:#111318;border-radius:12px;padding:16px;margin:18px 0}.note{font-size:13px;color:#9299a5}.error{color:#ff8383}.ready{text-align:center;padding:18px 0}.ready .mark{font-size:62px;color:#56d68b}
</style></head><body><section class="shell"><header class="top"><strong>OBS Creator Assistant</strong><br><small id="stepName">Welcome</small><div class="progress"><i id="bar"></i></div></header><main>
<section data-step="0"><h1>Let’s get you ready to clip</h1><p>Creator Assistant will check OBS and create a private connection on this computer.</p><div class="checks"><div class="check"><span>Creator Assistant installed</span><b class="ok">Ready</b></div><div class="check"><span>Private local connection</span><b class="ok">Protected</b></div><div class="check"><span>OBS connection</span><b id="obsCheck" class="wait">Checking…</b></div></div><p class="note">Your OBS password and local connection details stay on this computer.</p></section>
<section data-step="1" class="hidden"><h1>What do you want to clip?</h1><div class="choices" id="modes"><label class="choice"><input type="radio" name="mode" value="program" checked><div><strong>Program View</strong><span>Your clean production output.</span></div></label><label class="choice"><input type="radio" name="mode" value="viewer"><div><strong>Viewer View</strong><span>The phone-view feed with chat and reactions.</span></div></label><label class="choice"><input type="radio" name="mode" value="both"><div><strong>Both</strong><span>Save clean and viewer-perspective clips together.</span></div></label></div><div id="viewerOptions" class="hidden"><h2>How does the phone appear in OBS?</h2><div class="choices"><label class="choice"><input type="radio" name="capture" value="airplay"><div><strong>AirPlay</strong><span>Mirror an iPhone through an AirPlay receiver.</span></div></label><label class="choice"><input type="radio" name="capture" value="software_mirroring"><div><strong>Software mirroring</strong><span>Use your phone mirroring app.</span></div></label><label class="choice"><input type="radio" name="capture" value="hardware_capture"><div><strong>Hardware capture</strong><span>Use a cable and capture device.</span></div></label><label class="choice"><input type="radio" name="capture" value="other_obs_source"><div><strong>Other OBS source</strong><span>Use a source you already added to the Viewer OBS session.</span></div></label></div></div><p id="choiceError" class="error hidden"></p></section>
<section data-step="2" class="hidden"><h1>Connect to ChatGPT</h1><p>This is a one-time approval. Creator Assistant will not connect your account until you choose the button below.</p><div id="connectArea"></div><p class="note">You can finish local clipping setup now and connect ChatGPT later from the OBS dock.</p></section>
<section data-step="3" class="hidden ready"><div class="mark">✓</div><h1>Everything is ready</h1><p id="readyText">Creator Assistant is running in the background.</p><button class="primary" onclick="window.close()">Done</button></section>
<div class="actions" id="nav"><button class="secondary" id="back">Back</button><button class="primary" id="next">Continue</button></div><p id="fatal" class="error"></p>
</main></section><script>
let step=0,status=null,hydrated=false;const sections=[...document.querySelectorAll('[data-step]')],names=['Welcome','Clipping setup','Your approval','Ready'];
function show(){sections.forEach((x,i)=>x.classList.toggle('hidden',i!==step));stepName.textContent=names[step];bar.style.width=((step+1)*25)+'%';back.style.visibility=step===0?'hidden':'visible';next.textContent=step===2?'Finish setup':'Continue';nav.classList.toggle('hidden',step===3)}
function selected(name){return document.querySelector('input[name="'+name+'"]:checked')?.value}
function viewerVisibility(){viewerOptions.classList.toggle('hidden',selected('mode')==='program')}
document.querySelectorAll('input[name="mode"]').forEach(x=>x.addEventListener('change',viewerVisibility));
async function refresh(){try{status=await fetch('/api/setup/status').then(r=>r.json());obsCheck.textContent=status.obsConnected?'Connected':'Open OBS to connect';obsCheck.className=status.obsConnected?'ok':'wait';if(!hydrated){const s=status.setup;document.querySelector('input[name="mode"][value="'+s.clipMode+'"]').checked=true;if(s.viewerCaptureMethod){const c=document.querySelector('input[name="capture"][value="'+s.viewerCaptureMethod+'"]');if(c)c.checked=true}viewerVisibility();hydrated=true}renderConnect()}catch(e){fatal.textContent='Creator Assistant is still starting. Please try again.'}}
function renderConnect(){if(!status)return;const code=status.pairingCode||'------';connectArea.innerHTML=(status.connectUrl?'<a class="button primary" target="_blank" rel="noopener noreferrer" href="'+status.connectUrl+'">Approve and connect ChatGPT</a>':'<button class="primary" disabled>ChatGPT connection coming soon</button>')+'<div class="code">'+code+'</div><p>After approving, use this one-time code in ChatGPT to connect this OBS computer.</p>'}
back.onclick=()=>{if(step>0){step--;show()}};next.onclick=async()=>{choiceError.classList.add('hidden');if(step===1&&selected('mode')!=='program'&&!selected('capture')){choiceError.textContent='Choose how the viewer phone appears in OBS.';choiceError.classList.remove('hidden');return}if(step===2){next.disabled=true;try{const response=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json','x-obs-creator-assistant':'1'},body:JSON.stringify({clipMode:selected('mode'),viewerCaptureMethod:selected('capture')||null,viewerObsUrl:'ws://127.0.0.1:4456',viewerSourceName:''})});if(!response.ok)throw new Error((await response.json()).error);step=3;readyText.textContent=selected('mode')==='both'?'Program View and Viewer View clipping are configured.':(selected('mode')==='viewer'?'Viewer View clipping is configured.':'Program View clipping is configured.');show()}catch(e){fatal.textContent=e.message;next.disabled=false}return}step++;show()};show();refresh();setInterval(()=>{if(step!==3)refresh()},4000);
</script></body></html>`;
}

async function readRequestBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 32 * 1024) throw new Error("Setup request is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function obsIsConnected(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${bridgePort}/health`);
    const payload = await response.json() as { obsConnected?: boolean };
    return response.ok && payload.obsConnected === true;
  } catch { return false; }
}

function startOnboardingServer(): void {
  if (onboardingServer) return;
  onboardingServer = http.createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("cache-control", "no-store");
    if (req.method === "GET" && (req.url === "/api/setup/status" || req.url === "/status.json")) {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ...getRelayPairingState(),
        setup: readCreatorSetup(),
        assistantRunning: true,
        obsConnected: await obsIsConnected(),
        connectUrl: safeChatgptPluginUrl || null
      }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/setup") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      if (req.headers["x-obs-creator-assistant"] !== "1") {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: "This setup request was not started by Creator Assistant." }));
        return;
      }
      try {
        const config = writeCreatorSetup(await readRequestBody(req));
        await applyCreatorSetup(config);
        res.end(JSON.stringify({ ok: true, setup: config }));
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(onboardingHtml());
  });
  onboardingServer.listen(onboardingPort, "127.0.0.1", () => {
    console.log(`OBS Creator Assistant onboarding: http://127.0.0.1:${onboardingPort}`);
  });
}

async function connectLoop(): Promise<void> {
  const state = await ensureDeviceState();
  while (!stopped) {
    await new Promise<void>((resolve) => {
      socket = new WebSocket(websocketUrl(state), { maxPayload: 1024 * 1024 });
      socket.on("open", () => console.log("OBS Creator Assistant connected to hosted relay."));
      socket.on("message", async raw => {
        let message: any;
        try { message = JSON.parse(String(raw)); } catch { return; }
        if (message?.type !== "command" || !message.requestId || !message.command?.tool) return;
        try {
          const toolResult = await callLocalTool(String(message.command.tool), (message.command.arguments ?? {}) as Record<string, unknown>);
          socket?.send(JSON.stringify({ type: "result", requestId: message.requestId, ok: true, result: toolResult }));
        } catch (error) {
          socket?.send(JSON.stringify({ type: "result", requestId: message.requestId, ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
      });
      socket.on("close", () => resolve());
      socket.on("error", () => resolve());
    });
    if (!stopped) await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

export function startRelayClient(): void {
  stopped = false;
  startOnboardingServer();
  void connectLoop().catch(error => {
    console.error("Hosted relay connection failed:", error instanceof Error ? error.message : String(error));
  });
}

export function stopRelayClient(): void {
  stopped = true;
  socket?.close();
  socket = null;
  onboardingServer?.close();
  onboardingServer = null;
}

export function getRelayPairingState() {
  return {
    deviceId: currentState?.deviceId ?? null,
    pairingCode: currentState?.pairingCode ?? null,
    expiresAt: currentState?.expiresAt ?? null,
    relayConnected: socket?.readyState === WebSocket.OPEN,
    relayUrl: relayBaseUrl
  };
}
