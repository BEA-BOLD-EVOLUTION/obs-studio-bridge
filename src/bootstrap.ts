import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const installRoot = process.cwd();
const envPath = path.join(installRoot, ".env");
const stopPath = path.join(installRoot, ".stop");
const pidPath = path.join(process.cwd(), ".bridge.pid");

function exampleSetting(name: string, fallback: string): string {
  try {
    const line = fs.readFileSync(path.join(installRoot, ".env.example"), "utf8")
      .split(/\r?\n/)
      .find(candidate => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || fallback;
  } catch {
    return fallback;
  }
}

function ensureConfiguration(): void {
  try { fs.rmSync(stopPath); } catch {}
  if (fs.existsSync(envPath)) return;

  let obsPort = 4455;
  let obsPassword = "";
  const appData = process.env.APPDATA;
  if (appData) {
    const obsConfigPath = path.join(appData, "obs-studio", "plugin_config", "obs-websocket", "config.json");
    try {
      const config = JSON.parse(fs.readFileSync(obsConfigPath, "utf8")) as {
        server_port?: unknown;
        auth_required?: unknown;
        server_password?: unknown;
      };
      const candidatePort = Number(config.server_port);
      if (Number.isInteger(candidatePort) && candidatePort > 0 && candidatePort <= 65535) obsPort = candidatePort;
      if (config.auth_required !== false && typeof config.server_password === "string") {
        obsPassword = config.server_password;
      }
    } catch {}
  }

  const bridgeToken = crypto.randomBytes(48).toString("base64url");
  const lines = [
    `OBS_WEBSOCKET_URL=ws://127.0.0.1:${obsPort}`,
    `OBS_WEBSOCKET_PASSWORD=${JSON.stringify(obsPassword)}`,
    "CLIPPER_OBS_WEBSOCKET_URL=ws://127.0.0.1:4456",
    "CLIPPER_OBS_WEBSOCKET_PASSWORD=",
    "CLIPPER_CONTROL_PORT=8789",
    `BRIDGE_AUTH_TOKEN=${bridgeToken}`,
    "BRIDGE_PORT=8787",
    "ONBOARDING_PORT=8788",
    `RELAY_URL=${exampleSetting("RELAY_URL", "https://relay-production-bbb4.up.railway.app")}`,
    `CHATGPT_PLUGIN_URL=${exampleSetting("CHATGPT_PLUGIN_URL", "")}`
  ];
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

ensureConfiguration();
fs.writeFileSync(pidPath, String(process.pid), { encoding: "ascii" });

function removePidFile(): void {
  try {
    if (fs.readFileSync(pidPath, "ascii").trim() === String(process.pid)) fs.rmSync(pidPath);
  } catch {}
}

process.once("exit", removePidFile);
process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

await import("./server.js");
const { startClipperControlServer } = await import("./clipper-server.js");
startClipperControlServer();
const { startRelayClient } = await import("./relay-client.js");
startRelayClient();
