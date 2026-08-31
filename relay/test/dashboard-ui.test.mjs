import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_MIME_TYPE,
  DASHBOARD_URI,
  buildDashboardSnapshot,
  dashboardHtml
} from "../src/dashboard.js";

test("dashboard resource follows the MCP Apps UI contract", () => {
  assert.equal(DASHBOARD_URI, "ui://obs-creator-assistant/dashboard-v1.html");
  assert.equal(DASHBOARD_MIME_TYPE, "text/html;profile=mcp-app");
  assert.match(dashboardHtml, /ui\/initialize/);
  assert.match(dashboardHtml, /ui\/notifications\/tool-result/);
  assert.match(dashboardHtml, /tools\/call/);
  assert.match(dashboardHtml, /obs_get_dashboard_state/);
  assert.match(dashboardHtml, /obs_switch_scene/);
  assert.match(dashboardHtml, /No typing needed/);
  assert.match(dashboardHtml, /id="modeToggle"/);
  assert.doesNotMatch(dashboardHtml, /<input\b/);
});

test("dashboard snapshot selects the default online computer and normalizes OBS state", async () => {
  const listDevices = async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Offline PC", online: false, isDefault: false },
    { id: "22222222-2222-4222-8222-222222222222", name: "Studio PC", online: true, isDefault: true, productionRole: "camera_compositor" }
  ];
  const dispatchCommand = async (_token, _deviceId, command) => ({
    response: {
      result: {
        content: [{
          type: "text",
          text: JSON.stringify(command.tool === "obs_inspect_status" ? {
            version: { obsVersion: "31.1.2", obsWebSocketVersion: "5.6.3" },
            stream: { outputActive: false },
            recording: { outputActive: true },
            replayBuffer: { outputActive: true },
            virtualCamera: { outputActive: false }
          } : {
            currentProgramSceneName: "LIVE",
            scenes: [{ sceneName: "LIVE" }, { sceneName: "Media" }]
          })
        }]
      }
    }
  });

  const snapshot = await buildDashboardSnapshot({
    accessToken: "token",
    listDevices,
    dispatchCommand
  });

  assert.equal(snapshot.selectedDeviceId, "22222222-2222-4222-8222-222222222222");
  assert.equal(snapshot.connection.state, "connected");
  assert.equal(snapshot.obs.currentScene, "LIVE");
  assert.equal(snapshot.output.recording, true);
  assert.deepEqual(snapshot.scenes, [{ name: "LIVE", current: true }, { name: "Media", current: false }]);
});

test("dashboard snapshot remains useful when the selected computer is offline", async () => {
  const snapshot = await buildDashboardSnapshot({
    accessToken: "token",
    deviceId: "11111111-1111-4111-8111-111111111111",
    listDevices: async () => [{ id: "11111111-1111-4111-8111-111111111111", name: "Studio PC", online: false }],
    dispatchCommand: async () => { throw new Error("should not dispatch"); }
  });

  assert.equal(snapshot.connection.state, "offline");
  assert.deepEqual(snapshot.scenes, []);
  assert.equal(snapshot.output.streaming, null);
});
