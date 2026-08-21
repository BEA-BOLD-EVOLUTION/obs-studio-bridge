import assert from "node:assert/strict";
import test from "node:test";
import { startCoordinatedProduction, stopCoordinatedProduction } from "../src/production-coordinator.js";

const preset = {
  id: "preset-1",
  backgroundDeviceId: "background-pc",
  backgroundSceneName: "Background LIVE",
  compositorDeviceId: "camera-pc",
  compositorSceneName: "TikTok Composite"
};

function preflight() {
  return {
    summary: { obsReady: true },
    devices: {
      background: { issues: [], inspection: { obs: { currentProgramSceneName: "Background Previous" }, sources: [], virtualCamera: {} } },
      compositor: {
        issues: [],
        inspection: {
          obs: { currentProgramSceneName: "Camera Previous" },
          sources: [{ name: "Background Feed", enabled: false }, { name: "Camera", enabled: true }],
          virtualCamera: { outputActive: false }
        }
      }
    }
  };
}

function harness(dispatchOverride) {
  const commands = [];
  const updates = [];
  let capturedState;
  const dispatchCommand = async (token, deviceId, command) => {
    commands.push({ token, deviceId, command });
    if (dispatchOverride) return dispatchOverride({ token, deviceId, command, commands });
    return { ok: true };
  };
  return {
    commands,
    updates,
    getCapturedState: () => capturedState,
    dispatchCommand,
    createSession: async captured => {
      capturedState = captured;
      return { id: "session-1", status: "preparing", capturedState: captured, completedSteps: [], restorationSteps: [] };
    },
    updateSession: async (id, changes) => { updates.push({ id, changes }); },
    inspectReadiness: async () => ({ summary: { readyForTikTokPreview: true }, devices: { background: { issues: [] }, compositor: { issues: [] } } })
  };
}

test("confirmed startup runs ordered two-computer steps and verifies the final state", async () => {
  const h = harness();
  const result = await startCoordinatedProduction({
    accessToken: "owner-token",
    preset,
    readiness: preflight(),
    confirmed: true,
    ...h
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "active");
  assert.deepEqual(h.commands.map(entry => [entry.deviceId, entry.command.tool]), [
    ["background-pc", "obs_switch_scene"],
    ["camera-pc", "obs_set_source_visibility"],
    ["camera-pc", "obs_switch_scene"],
    ["camera-pc", "obs_start_virtual_camera"]
  ]);
  assert.equal(h.updates.at(-1).changes.status, "active");
});

test("startup failure restores completed changes in reverse order", async () => {
  const h = harness(({ command }) => {
    if (command.tool === "obs_switch_scene" && command.arguments.sceneName === "TikTok Composite") {
      throw new Error("camera scene failed");
    }
    return { ok: true };
  });
  const result = await startCoordinatedProduction({
    accessToken: "owner-token",
    preset,
    readiness: preflight(),
    confirmed: true,
    ...h
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "restored_after_failure");
  assert.deepEqual(h.commands.slice(-3).map(entry => [entry.command.tool, entry.command.arguments]), [
    ["obs_switch_scene", { sceneName: "Camera Previous" }],
    ["obs_set_source_visibility", { sceneName: "TikTok Composite", sourceName: "Background Feed", visible: false }],
    ["obs_switch_scene", { sceneName: "Background Previous" }]
  ]);
});

test("stop restores Virtual Camera, compositor scene, sources, and background scene in reverse order", async () => {
  const h = harness();
  const started = await startCoordinatedProduction({
    accessToken: "owner-token",
    preset,
    readiness: preflight(),
    confirmed: true,
    ...h
  });
  h.commands.length = 0;
  const stopped = await stopCoordinatedProduction({
    accessToken: "owner-token",
    confirmed: true,
    session: {
      id: started.sessionId,
      status: "active",
      capturedState: h.getCapturedState(),
      completedSteps: started.completedSteps,
      restorationSteps: []
    },
    dispatchCommand: h.dispatchCommand,
    updateSession: h.updateSession
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.status, "stopped");
  assert.deepEqual(h.commands.map(entry => [entry.command.tool, entry.command.arguments]), [
    ["obs_stop_virtual_camera", {}],
    ["obs_switch_scene", { sceneName: "Camera Previous" }],
    ["obs_set_source_visibility", { sceneName: "TikTok Composite", sourceName: "Background Feed", visible: false }],
    ["obs_switch_scene", { sceneName: "Background Previous" }]
  ]);
});

test("a Virtual Camera that was already active is neither started nor stopped by the session", async () => {
  const readiness = preflight();
  readiness.devices.compositor.inspection.virtualCamera.outputActive = true;
  const h = harness();
  const started = await startCoordinatedProduction({ accessToken: "owner-token", preset, readiness, confirmed: true, ...h });
  assert.equal(h.commands.some(entry => entry.command.tool === "obs_start_virtual_camera"), false);
  h.commands.length = 0;
  await stopCoordinatedProduction({
    accessToken: "owner-token",
    confirmed: true,
    session: { id: started.sessionId, status: "active", capturedState: h.getCapturedState(), completedSteps: started.completedSteps, restorationSteps: [] },
    dispatchCommand: h.dispatchCommand,
    updateSession: h.updateSession
  });
  assert.equal(h.commands.some(entry => entry.command.tool === "obs_stop_virtual_camera"), false);
});

test("stop restores role-specific volume and mute updates in reverse order", async () => {
  const h = harness();
  const stopped = await stopCoordinatedProduction({
    accessToken: "owner-token",
    confirmed: true,
    session: {
      id: "session-audio",
      status: "active",
      completedSteps: [
        { id: "volume-step", type: "input_volume", deviceId: "background-pc", inputName: "Music", previousVolumeDb: -6, volumeDb: -12 },
        { id: "mute-step", type: "input_mute", deviceId: "camera-pc", inputName: "Mic/Aux", previousMuted: false, muted: true }
      ],
      restorationSteps: []
    },
    dispatchCommand: h.dispatchCommand,
    updateSession: h.updateSession
  });
  assert.equal(stopped.ok, true);
  assert.deepEqual(h.commands.map(entry => [entry.deviceId, entry.command]), [
    ["camera-pc", { tool: "obs_set_input_mute", arguments: { inputName: "Mic/Aux", muted: false } }],
    ["background-pc", { tool: "obs_set_input_volume", arguments: { inputName: "Music", volumeDb: -6 } }]
  ]);
});

test("restoration continues after one device fails and reports manual attention", async () => {
  const h = harness(({ deviceId }) => {
    if (deviceId === "camera-pc") throw new Error("camera disconnected");
    return { ok: true };
  });
  const stopped = await stopCoordinatedProduction({
    accessToken: "owner-token",
    confirmed: true,
    session: {
      id: "session-1",
      status: "active",
      completedSteps: [
        { type: "background_scene", deviceId: "background-pc", previousSceneName: "Background Previous", sceneName: "Background LIVE" },
        { type: "compositor_scene", deviceId: "camera-pc", previousSceneName: "Camera Previous", sceneName: "TikTok Composite" }
      ],
      restorationSteps: []
    },
    dispatchCommand: h.dispatchCommand,
    updateSession: h.updateSession
  });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.status, "restore_failed");
  assert.equal(stopped.restoration.failures[0].deviceId, "camera-pc");
  assert.equal(h.commands.some(entry => entry.deviceId === "background-pc"), true);
});

test("startup and stop both require explicit confirmation", async () => {
  const h = harness();
  await assert.rejects(() => startCoordinatedProduction({ accessToken: "x", preset, readiness: preflight(), confirmed: false, ...h }), /Explicit confirmation/);
  await assert.rejects(() => stopCoordinatedProduction({ accessToken: "x", session: { id: "s" }, confirmed: false, ...h }), /Explicit confirmation/);
  assert.equal(h.commands.length, 0);
});
