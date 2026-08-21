import assert from "node:assert/strict";
import test from "node:test";
import { inspectProductionHealth, performanceMetrics } from "../src/production-health.js";

const session = {
  id: "session-1",
  status: "active",
  backgroundDeviceId: "background-id",
  compositorDeviceId: "compositor-id"
};

test("production health reads only status and performance from both assigned computers", async () => {
  const calls = [];
  const result = await inspectProductionHealth({
    accessToken: "account-token",
    session,
    expectedFps: 30,
    dispatchCommand: async (token, deviceId, command) => {
      calls.push([token, deviceId, command.tool]);
      if (command.tool === "obs_inspect_status") {
        return toolResult(statusPayload(deviceId === "compositor-id"));
      }
      return toolResult(statsPayload());
    }
  });

  assert.equal(result.healthy, true);
  assert.equal(result.transportSignalVerified, false);
  assert.match(result.limitation, /cannot verify/i);
  assert.deepEqual(calls, [
    ["account-token", "background-id", "obs_inspect_status"],
    ["account-token", "background-id", "obs_get_performance_stats"],
    ["account-token", "compositor-id", "obs_inspect_status"],
    ["account-token", "compositor-id", "obs_get_performance_stats"]
  ]);
  assert.equal(calls.some(call => !["obs_inspect_status", "obs_get_performance_stats"].includes(call[2])), false);
});

test("production health reports degraded FPS, CPU, lag, and inactive Virtual Camera", async () => {
  const result = await inspectProductionHealth({
    accessToken: "account-token",
    session,
    expectedFps: 60,
    dispatchCommand: async (_token, deviceId, command) => {
      if (command.tool === "obs_inspect_status") return toolResult(statusPayload(false));
      return toolResult(statsPayload({
        cpuUsage: deviceId === "background-id" ? 90 : 25,
        activeFps: 50,
        renderSkippedFrames: 20,
        renderTotalFrames: 1000,
        outputSkippedFrames: 15,
        outputTotalFrames: 1000
      }));
    }
  });

  assert.equal(result.healthy, false);
  assert.match(result.issues.join(" "), /CPU usage is high/);
  assert.match(result.issues.join(" "), /Active FPS is 50/);
  assert.match(result.issues.join(" "), /Render lag is elevated at 2%/);
  assert.match(result.issues.join(" "), /Encoding lag is elevated at 1.5%/);
  assert.match(result.issues.join(" "), /Virtual Camera is not active/);
});

test("one offline computer produces a per-role issue without hiding the other result", async () => {
  const result = await inspectProductionHealth({
    accessToken: "account-token",
    session,
    expectedFps: 30,
    dispatchCommand: async (_token, deviceId, command) => {
      if (deviceId === "background-id") throw new Error("Background PC is offline");
      return toolResult(command.tool === "obs_inspect_status" ? statusPayload(true) : statsPayload());
    }
  });

  assert.equal(result.healthy, false);
  assert.equal(result.devices.background.online, false);
  assert.equal(result.devices.compositor.healthy, true);
  assert.match(result.issues.join(" "), /Background PC is offline/);
});

test("performance metrics tolerate unavailable counters without inventing failures", () => {
  const issues = [];
  const metrics = performanceMetrics({}, 30, issues);
  assert.equal(metrics.cpuUsage, null);
  assert.equal(metrics.activeFps, null);
  assert.equal(metrics.renderLagPercent, 0);
  assert.deepEqual(issues, []);
});

function statusPayload(virtualCameraActive) {
  return {
    version: { obsVersion: "31.0.0", obsWebSocketVersion: "5.5.0" },
    stream: { outputActive: false },
    recording: { outputActive: false },
    replayBuffer: { outputActive: false },
    virtualCamera: { outputActive: virtualCameraActive }
  };
}

function statsPayload(overrides = {}) {
  return {
    cpuUsage: 20,
    memoryUsage: 512,
    activeFps: 30,
    renderSkippedFrames: 0,
    renderTotalFrames: 1000,
    outputSkippedFrames: 0,
    outputTotalFrames: 1000,
    ...overrides
  };
}

function toolResult(payload) {
  return { response: { result: { content: [{ type: "text", text: JSON.stringify(payload) }] } } };
}
