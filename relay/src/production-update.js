import crypto from "node:crypto";
import {
  inverseCommand,
  restorationKey,
  sceneCommand,
  sourceVisibilityCommand
} from "./production-coordinator.js";

export async function updateCoordinatedProduction({
  accessToken,
  session,
  role,
  action,
  sceneName,
  sourceName,
  visible,
  inputName,
  muted,
  volumeDb,
  confirmed,
  dispatchCommand,
  inspectTarget,
  inspectAudioInput,
  updateSession
}) {
  if (confirmed !== true) throw new Error("Explicit confirmation is required before changing an active dual-PC OBS production.");
  if (session.status !== "active") throw new Error(`Production updates require an active session; this session is '${session.status}'.`);
  validateUpdateInput({ role, action, sceneName, sourceName, visible, inputName, muted, volumeDb });

  const deviceId = roleDeviceId(session, role);
  const inspection = isAudioAction(action)
    ? await inspectAudioInput(deviceId, inputName)
    : await inspectTarget(deviceId, sceneName, action === "set_source_visibility" ? [sourceName] : []);
  const step = buildUpdateStep({ role, action, deviceId, sceneName, sourceName, visible, inputName, muted, volumeDb, inspection });
  if (!step) {
    return {
      ok: true,
      changed: false,
      sessionId: session.id,
      status: "active",
      role,
      action,
      message: "The requested OBS production state was already active. No change was sent."
    };
  }

  const recordedStep = { id: crypto.randomUUID(), origin: "production_update", ...step, completed: false };
  const completedSteps = [...(session.completedSteps || []), recordedStep];
  await updateSession(session.id, { completedSteps });

  try {
    await dispatchCommand(accessToken, deviceId, commandForStep(recordedStep));
    const verification = isAudioAction(action)
      ? await inspectAudioInput(deviceId, inputName)
      : await inspectTarget(deviceId, sceneName, action === "set_source_visibility" ? [sourceName] : []);
    verifyTargetState(recordedStep, verification);
    recordedStep.completed = true;
    await updateSession(session.id, { completedSteps });
    return {
      ok: true,
      changed: true,
      sessionId: session.id,
      status: "active",
      role,
      action,
      completedStep: recordedStep,
      message: `${roleLabel(role)} OBS was updated. TikTok LIVE Studio was not controlled.`
    };
  } catch (error) {
    return compensateFailedUpdate({
      accessToken,
      session,
      recordedStep,
      completedSteps,
      dispatchCommand,
      inspectTarget,
      inspectAudioInput,
      updateSession,
      error
    });
  }
}

export function buildUpdateStep({ role, action, deviceId, sceneName, sourceName, visible, inputName, muted, volumeDb, inspection }) {
  if (action === "switch_scene") {
    if (!inspection?.scene?.exists) throw new Error(`Scene '${sceneName}' was not found on the ${roleLabel(role)} computer.`);
    if (sourceName !== undefined || visible !== undefined) throw new Error("Scene switches do not accept sourceName or visible.");
    const previousSceneName = inspection.obs?.currentProgramSceneName;
    if (typeof previousSceneName !== "string" || !previousSceneName) throw new Error("OBS did not report the current program scene.");
    if (previousSceneName === sceneName) return null;
    return {
      type: role === "background" ? "background_scene" : "compositor_scene",
      deviceId,
      previousSceneName,
      sceneName
    };
  }

  if (action === "set_source_visibility") {
    if (!inspection?.scene?.exists) throw new Error(`Scene '${sceneName}' was not found on the ${roleLabel(role)} computer.`);
    if (typeof sourceName !== "string" || !sourceName.trim()) throw new Error("sourceName is required for a source visibility update.");
    if (typeof visible !== "boolean") throw new Error("visible must be true or false for a source visibility update.");
    const source = inspection.sources?.find(candidate => candidate.name === sourceName);
    if (!source?.exists) throw new Error(`Source '${sourceName}' was not found in scene '${sceneName}'.`);
    const previousVisible = Boolean(source.enabled);
    if (previousVisible === visible) return null;
    return {
      type: "source_visibility",
      deviceId,
      sceneName,
      sourceName,
      previousVisible,
      visible
    };
  }

  if (action === "set_input_mute") {
    const previousMuted = Boolean(inspection.inputMuted);
    if (previousMuted === muted) return null;
    return { type: "input_mute", deviceId, inputName, previousMuted, muted };
  }

  if (action === "set_input_volume") {
    const previousVolumeDb = Number(inspection.inputVolumeDb);
    if (!Number.isFinite(previousVolumeDb)) throw new Error(`OBS did not report a readable volume for input '${inputName}'.`);
    if (Math.abs(previousVolumeDb - volumeDb) <= 0.01) return null;
    return { type: "input_volume", deviceId, inputName, previousVolumeDb, volumeDb };
  }

  throw new Error(`Unsupported production update action '${action}'.`);
}

function validateUpdateInput({ role, action, sceneName, sourceName, visible, inputName, muted, volumeDb }) {
  roleDeviceId({ backgroundDeviceId: "background", compositorDeviceId: "compositor" }, role);
  if (action === "switch_scene") {
    requireSceneName(sceneName);
    if (sourceName !== undefined || visible !== undefined) throw new Error("Scene switches do not accept sourceName or visible.");
    return;
  }
  if (action === "set_source_visibility") {
    requireSceneName(sceneName);
    if (typeof sourceName !== "string" || !sourceName.trim()) throw new Error("sourceName is required for a source visibility update.");
    if (typeof visible !== "boolean") throw new Error("visible must be true or false for a source visibility update.");
    return;
  }
  if (action === "set_input_mute") {
    requireInputName(inputName);
    if (typeof muted !== "boolean") throw new Error("muted must be true or false for an input mute update.");
    rejectSceneArguments({ sceneName, sourceName, visible });
    if (volumeDb !== undefined) throw new Error("Input mute updates do not accept volumeDb.");
    return;
  }
  if (action === "set_input_volume") {
    requireInputName(inputName);
    if (!Number.isFinite(volumeDb) || volumeDb < -100 || volumeDb > 26) throw new Error("volumeDb must be between -100 and +26.");
    rejectSceneArguments({ sceneName, sourceName, visible });
    if (muted !== undefined) throw new Error("Input volume updates do not accept muted.");
    return;
  }
  throw new Error(`Unsupported production update action '${action}'.`);
}

async function compensateFailedUpdate({
  accessToken,
  session,
  recordedStep,
  completedSteps,
  dispatchCommand,
  inspectTarget,
  inspectAudioInput,
  updateSession,
  error
}) {
  const failure = errorMessage(error);
  const key = restorationKey(recordedStep);
  const restorationSteps = [...(session.restorationSteps || [])];
  try {
    await dispatchCommand(accessToken, recordedStep.deviceId, inverseCommand(recordedStep));
    const inspection = isAudioStep(recordedStep)
      ? await inspectAudioInput(recordedStep.deviceId, recordedStep.inputName)
      : await inspectTarget(
        recordedStep.deviceId,
        recordedStep.type === "source_visibility" ? recordedStep.sceneName : recordedStep.previousSceneName,
        recordedStep.type === "source_visibility" ? [recordedStep.sourceName] : []
      );
    verifyRestoredState(recordedStep, inspection);
    restorationSteps.push({ key, type: recordedStep.type, deviceId: recordedStep.deviceId, ok: true, origin: "production_update_failure" });
    await updateSession(session.id, { status: "active", completedSteps, restorationSteps });
    return {
      ok: false,
      changed: true,
      sessionId: session.id,
      status: "active",
      error: failure,
      restoration: { ok: true, manualAttentionRequired: false },
      message: "The requested update failed, and the previous OBS state was restored. TikTok LIVE Studio was not controlled."
    };
  } catch (restorationError) {
    const restorationFailure = errorMessage(restorationError);
    restorationSteps.push({
      key,
      type: recordedStep.type,
      deviceId: recordedStep.deviceId,
      ok: false,
      origin: "production_update_failure",
      error: restorationFailure
    });
    await updateSession(session.id, {
      status: "restore_failed",
      completedSteps,
      restorationSteps,
      errorSummary: `Production update failed: ${failure} Restoration failed: ${restorationFailure}`
    });
    return {
      ok: false,
      changed: true,
      sessionId: session.id,
      status: "restore_failed",
      error: failure,
      restoration: { ok: false, error: restorationFailure, manualAttentionRequired: true },
      message: "The production update and automatic restoration both failed. Manual OBS attention is required before continuing."
    };
  }
}

function commandForStep(step) {
  if (step.type === "background_scene" || step.type === "compositor_scene") return sceneCommand(step.sceneName);
  if (step.type === "source_visibility") return sourceVisibilityCommand(step.sceneName, step.sourceName, step.visible);
  if (step.type === "input_mute") return { tool: "obs_set_input_mute", arguments: { inputName: step.inputName, muted: step.muted } };
  return { tool: "obs_set_input_volume", arguments: { inputName: step.inputName, volumeDb: step.volumeDb } };
}

function verifyTargetState(step, inspection) {
  if (step.type === "input_mute") {
    if (Boolean(inspection.inputMuted) !== step.muted) throw new Error("OBS did not confirm the requested input mute state.");
    return;
  }
  if (step.type === "input_volume") {
    if (Math.abs(Number(inspection.inputVolumeDb) - step.volumeDb) > 0.01) throw new Error("OBS did not confirm the requested input volume.");
    return;
  }
  if (step.type === "source_visibility") {
    const source = inspection.sources?.find(candidate => candidate.name === step.sourceName);
    if (!source?.exists || Boolean(source.enabled) !== step.visible) throw new Error("OBS did not confirm the requested source visibility.");
    return;
  }
  if (inspection.obs?.currentProgramSceneName !== step.sceneName) throw new Error("OBS did not confirm the requested program scene.");
}

function verifyRestoredState(step, inspection) {
  if (step.type === "input_mute") {
    if (Boolean(inspection.inputMuted) !== step.previousMuted) throw new Error("OBS did not confirm the previous input mute state.");
    return;
  }
  if (step.type === "input_volume") {
    if (Math.abs(Number(inspection.inputVolumeDb) - step.previousVolumeDb) > 0.01) throw new Error("OBS did not confirm the previous input volume.");
    return;
  }
  if (step.type === "source_visibility") {
    const source = inspection.sources?.find(candidate => candidate.name === step.sourceName);
    if (!source?.exists || Boolean(source.enabled) !== step.previousVisible) throw new Error("OBS did not confirm the previous source visibility.");
    return;
  }
  if (inspection.obs?.currentProgramSceneName !== step.previousSceneName) throw new Error("OBS did not confirm the previous program scene.");
}

function requireSceneName(sceneName) {
  if (typeof sceneName !== "string" || !sceneName.trim()) throw new Error("sceneName is required for this production update.");
}

function requireInputName(inputName) {
  if (typeof inputName !== "string" || !inputName.trim()) throw new Error("inputName is required for an audio production update.");
}

function rejectSceneArguments({ sceneName, sourceName, visible }) {
  if (sceneName !== undefined || sourceName !== undefined || visible !== undefined) throw new Error("Audio updates do not accept scene or source arguments.");
}

function isAudioAction(action) {
  return action === "set_input_mute" || action === "set_input_volume";
}

function isAudioStep(step) {
  return step.type === "input_mute" || step.type === "input_volume";
}

function roleDeviceId(session, role) {
  if (role === "background") return session.backgroundDeviceId;
  if (role === "camera_compositor") return session.compositorDeviceId;
  throw new Error(`Unsupported production role '${role}'.`);
}

function roleLabel(role) {
  return role === "camera_compositor" ? "Camera/Compositor" : "Background";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
