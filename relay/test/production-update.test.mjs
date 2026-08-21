import assert from "node:assert/strict";
import test from "node:test";
import { updateCoordinatedProduction } from "../src/production-update.js";

const baseSession = {
  id: "session-1",
  status: "active",
  backgroundDeviceId: "background-id",
  compositorDeviceId: "compositor-id",
  completedSteps: [],
  restorationSteps: []
};

test("a confirmed background scene update targets only the session's Background computer", async () => {
  let currentScene = "Background LIVE";
  const calls = [];
  const updates = [];
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "switch_scene",
    sceneName: "Neon City",
    confirmed: true,
    inspectTarget: async () => sceneInspection(currentScene),
    dispatchCommand: async (token, deviceId, command) => {
      calls.push([token, deviceId, command]);
      currentScene = command.arguments.sceneName;
    },
    updateSession: async (_id, changes) => updates.push(structuredClone(changes))
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.completedStep.type, "background_scene");
  assert.equal(result.completedStep.previousSceneName, "Background LIVE");
  assert.equal(result.completedStep.sceneName, "Neon City");
  assert.equal(result.completedStep.completed, true);
  assert.match(result.completedStep.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls, [["account-token", "background-id", {
    tool: "obs_switch_scene",
    arguments: { sceneName: "Neon City" }
  }]]);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].completedSteps[0].completed, false);
  assert.equal(updates[1].completedSteps[0].completed, true);
});

test("a source update captures visibility and targets only the selected compositor", async () => {
  let enabled = true;
  const calls = [];
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "camera_compositor",
    action: "set_source_visibility",
    sceneName: "Composite LIVE",
    sourceName: "Lower Third",
    visible: false,
    confirmed: true,
    inspectTarget: async () => sourceInspection(enabled),
    dispatchCommand: async (_token, deviceId, command) => {
      calls.push([deviceId, command]);
      enabled = command.arguments.visible;
    },
    updateSession: async () => {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.completedStep.previousVisible, true);
  assert.deepEqual(calls, [["compositor-id", {
    tool: "obs_set_source_visibility",
    arguments: { sceneName: "Composite LIVE", sourceName: "Lower Third", visible: false }
  }]]);
});

test("an uncertain scene update is restored and the session remains active", async () => {
  let currentScene = "Background LIVE";
  let dispatchCount = 0;
  const updates = [];
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "switch_scene",
    sceneName: "Neon City",
    confirmed: true,
    inspectTarget: async () => sceneInspection(currentScene),
    dispatchCommand: async (_token, _deviceId, command) => {
      dispatchCount += 1;
      currentScene = command.arguments.sceneName;
      if (dispatchCount === 1) throw new Error("OBS command timed out");
    },
    updateSession: async (_id, changes) => updates.push(structuredClone(changes))
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "active");
  assert.equal(result.restoration.ok, true);
  assert.equal(currentScene, "Background LIVE");
  assert.equal(updates.at(-1).status, "active");
  assert.equal(updates.at(-1).restorationSteps[0].ok, true);
});

test("failed update restoration locks the session for manual attention", async () => {
  let currentScene = "Background LIVE";
  const updates = [];
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "switch_scene",
    sceneName: "Neon City",
    confirmed: true,
    inspectTarget: async () => sceneInspection(currentScene),
    dispatchCommand: async () => { throw new Error("Background PC is offline"); },
    updateSession: async (_id, changes) => updates.push(structuredClone(changes))
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "restore_failed");
  assert.equal(result.restoration.manualAttentionRequired, true);
  assert.equal(updates.at(-1).status, "restore_failed");
  assert.match(updates.at(-1).errorSummary, /Restoration failed/);
});

test("an update already in the requested state sends no command or audit mutation", async () => {
  let dispatchCount = 0;
  let updateCount = 0;
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "switch_scene",
    sceneName: "Background LIVE",
    confirmed: true,
    inspectTarget: async () => sceneInspection("Background LIVE"),
    dispatchCommand: async () => { dispatchCount += 1; },
    updateSession: async () => { updateCount += 1; }
  });

  assert.equal(result.changed, false);
  assert.equal(dispatchCount, 0);
  assert.equal(updateCount, 0);
});

test("updates require confirmation, an active session, and complete action arguments", async () => {
  const common = {
    accessToken: "account-token",
    session: baseSession,
    role: "camera_compositor",
    action: "set_source_visibility",
    sceneName: "Composite LIVE",
    sourceName: "Lower Third",
    visible: false,
    inspectTarget: async () => sourceInspection(true),
    dispatchCommand: async () => {},
    updateSession: async () => {}
  };
  await assert.rejects(() => updateCoordinatedProduction({ ...common, confirmed: false }), /confirmation/i);
  await assert.rejects(() => updateCoordinatedProduction({ ...common, confirmed: true, session: { ...baseSession, status: "stopped" } }), /active session/i);
  await assert.rejects(() => updateCoordinatedProduction({ ...common, confirmed: true, sourceName: undefined }), /sourceName is required/);
});

function sceneInspection(currentProgramSceneName) {
  return { scene: { exists: true }, obs: { currentProgramSceneName }, sources: [] };
}

function sourceInspection(enabled) {
  return {
    scene: { exists: true },
    obs: { currentProgramSceneName: "Composite LIVE" },
    sources: [{ name: "Lower Third", exists: true, enabled }]
  };
}
