import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import WebSocket from "ws";
import { isRemoteToolAllowed } from "./remote-tools.js";

const relayBaseUrl = (process.env.RELAY_URL?.trim() || "https://relay-production-bbb4.up.railway.app").replace(/\/$/, "");
const bridgePort = Number.parseInt(process.env.BRIDGE_PORT || "8787", 10) || 8787;
const bridgeToken = process.env.BRIDGE_AUTH_TOKEN?.trim() || "";
const chatgptPluginUrl = process.env.CHATGPT_PLUGIN_URL?.trim() || "";
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

function onboardingHtml(): string {
  const code = currentState?.pairingCode ?? "------";
  const connected = socket?.readyState === WebSocket.OPEN;
  const expired = currentState?.expiresAt ? Date.parse(currentState.expiresAt) < Date.now() : false;
  const connectButton = chatgptPluginUrl
    ? `<a class="primary" href="${chatgptPluginUrl}" target="_blank" rel="noopener noreferrer">Connect ChatGPT</a>`
    : `<button class="primary" disabled>ChatGPT app connection pending</button>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OBS Creator Assistant</title><style>body{font-family:system-ui;background:#f4f4f4;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}main{max-width:620px;width:100%;background:white;border:1px solid #ddd;border-radius:20px;padding:32px;box-shadow:0 14px 45px rgba(0,0,0,.08)}h1{margin-top:0}.status{display:flex;justify-content:space-between;padding:14px 0;border-top:1px solid #eee}.ok{color:#176b37;font-weight:700}.warn{color:#8a5a00;font-weight:700}.code{font-size:42px;letter-spacing:8px;font-weight:800;text-align:center;padding:20px;background:#f6f6f6;border-radius:14px;margin:18px 0}.actions{display:flex;gap:12px;flex-wrap:wrap}.primary{background:#1f1f1f;color:white;border:0;border-radius:10px;padding:12px 18px;text-decoration:none;font:inherit}.primary:disabled{opacity:.45}p{color:#555;line-height:1.5}</style></head><body><main><h1>OBS Creator Assistant</h1><p>Your computer is installed and connected securely. In ChatGPT, use the six-digit code below to pair this computer to your account.</p><div class="status"><span>Hosted connection</span><span class="${connected ? "ok" : "warn"}">${connected ? "Connected" : "Connecting"}</span></div><div class="status"><span>Pairing code</span><span class="${expired ? "warn" : "ok"}">${expired ? "Expired" : "Ready"}</span></div><div class="code">${code}</div><p>After connecting the ChatGPT app, say: <strong>Pair code ${code}</strong></p><div class="actions">${connectButton}</div><p>Once paired, you can ask ChatGPT to set up your LIVE, share a window, run an AI transition, switch scenes, or troubleshoot OBS.</p><script>setTimeout(()=>location.reload(),5000)</script></main></body></html>`;
}

function startOnboardingServer(): void {
  if (onboardingServer) return;
  onboardingServer = http.createServer((req, res) => {
    if (req.url === "/status.json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(getRelayPairingState()));
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
