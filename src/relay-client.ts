import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import WebSocket from "ws";

const relayBaseUrl = (process.env.RELAY_URL?.trim() || "https://relay-production-bbb4.up.railway.app").replace(/\/$/, "");
const bridgePort = Number.parseInt(process.env.BRIDGE_PORT || "8787", 10) || 8787;
const bridgeToken = process.env.BRIDGE_AUTH_TOKEN?.trim() || "";
const deviceStatePath = path.join(process.cwd(), ".device.json");

const allowedRemoteTools = new Set([
  "obs_inspect_status",
  "obs_list_scenes",
  "obs_switch_scene",
  "obs_run_ai_transition",
  "obs_share_capture_source",
  "obs_run_workflow"
]);

type DeviceState = {
  deviceId: string;
  deviceSecret: string;
  pairingCode: string;
  expiresAt: string;
};

let currentState: DeviceState | null = null;
let socket: WebSocket | null = null;
let stopped = false;

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
  if (!response.ok) {
    throw new Error(`Device registration failed (${response.status}).`);
  }
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
  if (!allowedRemoteTools.has(tool)) {
    throw new Error(`Remote tool '${tool}' is not allowlisted by the local companion.`);
  }
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

async function connectLoop(): Promise<void> {
  const state = await ensureDeviceState();

  while (!stopped) {
    await new Promise<void>((resolve) => {
      socket = new WebSocket(websocketUrl(state));

      socket.on("open", () => {
        console.log("OBS Creator Assistant connected to hosted relay.");
      });

      socket.on("message", async raw => {
        let message: any;
        try { message = JSON.parse(String(raw)); } catch { return; }
        if (message?.type !== "command" || !message.requestId || !message.command?.tool) return;

        try {
          const toolResult = await callLocalTool(
            String(message.command.tool),
            (message.command.arguments ?? {}) as Record<string, unknown>
          );
          socket?.send(JSON.stringify({
            type: "result",
            requestId: message.requestId,
            ok: true,
            result: toolResult
          }));
        } catch (error) {
          socket?.send(JSON.stringify({
            type: "result",
            requestId: message.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          }));
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
  void connectLoop().catch(error => {
    console.error("Hosted relay connection failed:", error instanceof Error ? error.message : String(error));
  });
}

export function stopRelayClient(): void {
  stopped = true;
  socket?.close();
  socket = null;
}

export function getRelayPairingState(): { deviceId: string | null; pairingCode: string | null; expiresAt: string | null; relayUrl: string } {
  return {
    deviceId: currentState?.deviceId ?? null,
    pairingCode: currentState?.pairingCode ?? null,
    expiresAt: currentState?.expiresAt ?? null,
    relayUrl: relayBaseUrl
  };
}
