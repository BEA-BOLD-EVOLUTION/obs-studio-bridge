import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toolPayload } from "./dual-pc.js";

export const DASHBOARD_URI = "ui://obs-creator-assistant/dashboard-v1.html";
export const DASHBOARD_MIME_TYPE = "text/html;profile=mcp-app";

const dashboardPath = fileURLToPath(new URL("../web/dashboard.html", import.meta.url));
export const dashboardHtml = readFileSync(dashboardPath, "utf8");

let stateVersion = 0;

function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    online: Boolean(device.online),
    isDefault: Boolean(device.isDefault),
    productionRole: device.productionRole || null,
    lastSeenAt: device.lastSeenAt || null
  };
}

function selectedDevice(devices, deviceId) {
  if (deviceId) {
    const device = devices.find(candidate => candidate.id === deviceId);
    if (!device) throw new Error("That OBS computer is not linked to this account.");
    return device;
  }
  return devices.find(device => device.online && device.isDefault)
    || devices.find(device => device.online)
    || devices.find(device => device.isDefault)
    || devices[0]
    || null;
}

function emptyOutput() {
  return { streaming: null, recording: null, replayBuffer: null, virtualCamera: null };
}

function outputActive(value) {
  return typeof value?.outputActive === "boolean" ? value.outputActive : null;
}

export async function buildDashboardSnapshot({ accessToken, deviceId, listDevices, dispatchCommand }) {
  const devices = (await listDevices(accessToken)).map(publicDevice);
  const selected = selectedDevice(devices, deviceId);
  const snapshot = {
    stateVersion: ++stateVersion,
    updatedAt: new Date().toISOString(),
    selectedDeviceId: selected?.id || null,
    devices,
    connection: {
      state: selected ? (selected.online ? "connected" : "offline") : "unpaired",
      label: selected ? (selected.online ? "OBS connected" : "Computer offline") : "No computer paired",
      detail: selected
        ? (selected.online ? `${selected.name} is ready for remote controls.` : `Open OBS Creator Assistant on ${selected.name} to reconnect.`)
        : "Pair a computer from the OBS Creator Assistant setup flow."
    },
    obs: { version: null, webSocketVersion: null, currentScene: null },
    output: emptyOutput(),
    scenes: [],
    warnings: []
  };

  if (!selected?.online) return snapshot;

  const [statusResult, scenesResult] = await Promise.allSettled([
    dispatchCommand(accessToken, selected.id, { tool: "obs_inspect_status", arguments: {} }),
    dispatchCommand(accessToken, selected.id, { tool: "obs_list_scenes", arguments: {} })
  ]);

  if (statusResult.status === "fulfilled") {
    const status = toolPayload(statusResult.value);
    snapshot.obs.version = status.version?.obsVersion || null;
    snapshot.obs.webSocketVersion = status.version?.obsWebSocketVersion || null;
    snapshot.output = {
      streaming: outputActive(status.stream),
      recording: outputActive(status.recording),
      replayBuffer: outputActive(status.replayBuffer),
      virtualCamera: outputActive(status.virtualCamera)
    };
  } else {
    snapshot.warnings.push(statusResult.reason instanceof Error ? statusResult.reason.message : String(statusResult.reason));
  }

  if (scenesResult.status === "fulfilled") {
    const sceneData = toolPayload(scenesResult.value);
    snapshot.obs.currentScene = sceneData.currentProgramSceneName || null;
    snapshot.scenes = (sceneData.scenes || []).map(scene => ({
      name: scene.sceneName,
      current: scene.sceneName === sceneData.currentProgramSceneName
    }));
  } else {
    snapshot.warnings.push(scenesResult.reason instanceof Error ? scenesResult.reason.message : String(scenesResult.reason));
  }

  return snapshot;
}

export function dashboardResult(snapshot, { rendered = false } = {}) {
  const selected = snapshot.devices.find(device => device.id === snapshot.selectedDeviceId);
  const summary = selected
    ? `${selected.name}: ${snapshot.connection.label}${snapshot.obs.currentScene ? `, scene ${snapshot.obs.currentScene}` : ""}.`
    : snapshot.connection.label;
  return {
    structuredContent: snapshot,
    content: [{ type: "text", text: rendered ? `Opening OBS Creator Dashboard. ${summary}` : summary }]
  };
}
