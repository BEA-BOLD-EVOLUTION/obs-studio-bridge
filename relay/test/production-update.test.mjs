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

test("a confirmed mute update captures prior state and targets only the selected role", async () => {
  let muted = false;
  const calls = [];
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "camera_compositor",
    action: "set_input_mute",
    inputName: "Mic/Aux",
    muted: true,
    confirmed: true,
    inspectAudioInput: async () => ({ inputName: "Mic/Aux", inputMuted: muted, inputVolumeDb: -6 }),
    dispatchCommand: async (_token, deviceId, command) => {
      calls.push([deviceId, command]);
      muted = command.arguments.muted;
    },
    updateSession: async () => {}
  });

  assert.equal(result.ok, true);
  assert.equal(result.completedStep.type, "input_mute");
  assert.equal(result.completedStep.previousMuted, false);
  assert.deepEqual(calls, [["compositor-id", {
    tool: "obs_set_input_mute",
    arguments: { inputName: "Mic/Aux", muted: true }
  }]]);
});

test("a volume update is bounded, restorable, and avoids duplicate commands", async () => {
  let volumeDb = -6;
  const calls = [];
  const common = {
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "set_input_volume",
    inputName: "Music",
    volumeDb: -12,
    confirmed: true,
    inspectAudioInput: async () => ({ inputName: "Music", inputMuted: false, inputVolumeDb: volumeDb }),
    dispatchCommand: async (_token, deviceId, command) => {
      calls.push([deviceId, command]);
      volumeDb = command.arguments.volumeDb;
    },
    updateSession: async () => {}
  };
  const changed = await updateCoordinatedProduction(common);
  const unchanged = await updateCoordinatedProduction(common);

  assert.equal(changed.completedStep.previousVolumeDb, -6);
  assert.equal(unchanged.changed, false);
  assert.deepEqual(calls, [["background-id", {
    tool: "obs_set_input_volume",
    arguments: { inputName: "Music", volumeDb: -12 }
  }]]);
  await assert.rejects(() => updateCoordinatedProduction({ ...common, volumeDb: 30 }), /between -100 and \+26/);
});

test("an uncertain audio update restores the captured audio state", async () => {
  let volumeDb = -6;
  let dispatchCount = 0;
  const result = await updateCoordinatedProduction({
    accessToken: "account-token",
    session: baseSession,
    role: "camera_compositor",
    action: "set_input_volume",
    inputName: "Music",
    volumeDb: -18,
    confirmed: true,
    inspectAudioInput: async () => ({ inputName: "Music", inputMuted: false, inputVolumeDb: volumeDb }),
    dispatchCommand: async (_token, _deviceId, command) => {
      dispatchCount += 1;
      volumeDb = command.arguments.volumeDb;
      if (dispatchCount === 1) throw new Error("OBS command timed out");
    },
    updateSession: async () => {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.restoration.ok, true);
  assert.equal(volumeDb, -6);
});

test("audio updates reject mixed scene arguments and incomplete audio targets", async () => {
  const common = {
    accessToken: "account-token",
    session: baseSession,
    role: "background",
    action: "set_input_mute",
    inputName: "Mic",
    muted: true,
    confirmed: true,
    inspectAudioInput: async () => ({ inputName: "Mic", inputMuted: false, inputVolumeDb: -6 }),
    dispatchCommand: async () => {},
    updateSession: async () => {}
  };
  await assert.rejects(() => updateCoordinatedProduction({ ...common, sceneName: "LIVE" }), /do not accept scene/i);
  await assert.rejects(() => updateCoordinatedProduction({ ...common, inputName: undefined }), /inputName is required/i);
  await assert.rejects(() => updateCoordinatedProduction({ ...common, muted: undefined }), /muted must be true or false/i);
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
