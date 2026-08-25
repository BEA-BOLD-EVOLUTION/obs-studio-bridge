import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readCreatorSetup } from "./setup-config.js";
import { ensureObsWebSocketConfiguration } from "./obs-config.js";

const installRoot = process.cwd();
const packageRoot = process.env.OBS_CREATOR_ASSISTANT_PACKAGE_ROOT?.trim() || installRoot;
const envPath = path.join(installRoot, ".env");
const stopPath = path.join(installRoot, ".stop");
const pidPath = path.join(process.cwd(), ".bridge.pid");
const launcherPath = path.join(packageRoot, "OBS-Creator-Assistant.exe");

function exampleSetting(name: string, fallback: string): string {
  try {
    const line = fs.readFileSync(path.join(packageRoot, ".env.example"), "utf8")
      .split(/\r?\n/)
      .find(candidate => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || fallback;
  } catch {
    return fallback;
  }
}

function ensureConfiguration(): void {
  try { fs.rmSync(stopPath); } catch {}
  let obsUrl = "ws://127.0.0.1:4455";
  let obsPassword = "";
  const appData = process.env.APPDATA;
  if (appData) {
    const obsConfigPath = path.join(appData, "obs-studio", "plugin_config", "obs-websocket", "config.json");
    const detected = ensureObsWebSocketConfiguration(obsConfigPath, fs.existsSync(launcherPath));
    obsUrl = detected.url;
    obsPassword = detected.password;
  }

  process.env.OBS_WEBSOCKET_URL ||= obsUrl;
  process.env.OBS_WEBSOCKET_PASSWORD ??= obsPassword;
  const setup = readCreatorSetup(installRoot);
  process.env.CLIPPER_OBS_WEBSOCKET_URL ||= setup.viewerObsUrl;
  process.env.CLIP_MODE ||= setup.clipMode;
  process.env.VIEWER_CAPTURE_METHOD ||= setup.viewerCaptureMethod ?? "";
  process.env.VIEWER_SOURCE_NAME ||= setup.viewerSourceName;
  process.env.BRIDGE_PORT ||= "8787";
  process.env.ONBOARDING_PORT ||= "8788";
  process.env.CLIPPER_CONTROL_PORT ||= "8789";
  process.env.RELAY_URL ||= exampleSetting("RELAY_URL", "https://relay-production-bbb4.up.railway.app");
  process.env.CHATGPT_PLUGIN_URL ||= exampleSetting("CHATGPT_PLUGIN_URL", "");

  if (fs.existsSync(launcherPath)) {
    const token = execFileSync(launcherPath, ["--read-bridge-token"], {
      cwd: installRoot,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (token.length < 32) throw new Error("The encrypted local connection could not be opened.");
    process.env.BRIDGE_AUTH_TOKEN = token;
    return;
  }

  // Developer/test harness: retain the documented .env workflow outside installed builds.
  if (fs.existsSync(envPath)) return;

  const bridgeToken = crypto.randomBytes(48).toString("base64url");
  const lines = [
    `OBS_WEBSOCKET_URL=${obsUrl}`,
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
