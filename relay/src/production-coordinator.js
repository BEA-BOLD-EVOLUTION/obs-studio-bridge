export async function startCoordinatedProduction({
  accessToken,
  preset,
  readiness,
  confirmed,
  dispatchCommand,
  createSession,
  updateSession,
  inspectReadiness
}) {
  if (confirmed !== true) throw new Error("Explicit confirmation is required before preparing both computers and starting OBS Virtual Camera.");
  if (!readiness.summary?.obsReady) {
    throw new Error(`Dual-PC readiness failed: ${readinessIssues(readiness).join(" ")}`);
  }

  const capturedState = captureProductionState(readiness);
  const session = await createSession(capturedState);
  const completedSteps = [];

  const runStep = async (step, command) => {
    const recordedStep = { ...step, completed: false };
    completedSteps.push(recordedStep);
    await updateSession(session.id, { completedSteps });
    const response = await dispatchCommand(accessToken, step.deviceId, command);
    recordedStep.completed = true;
    await updateSession(session.id, { completedSteps });
    return response;
  };

  try {
    if (capturedState.backgroundSceneName !== preset.backgroundSceneName) {
      await runStep({
        type: "background_scene",
        deviceId: preset.backgroundDeviceId,
        previousSceneName: capturedState.backgroundSceneName,
        sceneName: preset.backgroundSceneName
      }, sceneCommand(preset.backgroundSceneName));
    }

    for (const source of capturedState.compositorSources.filter(source => !source.visible)) {
      await runStep({
        type: "source_visibility",
        deviceId: preset.compositorDeviceId,
        sceneName: preset.compositorSceneName,
        sourceName: source.name,
        previousVisible: false,
        visible: true
      }, sourceVisibilityCommand(preset.compositorSceneName, source.name, true));
    }

    if (capturedState.compositorSceneName !== preset.compositorSceneName) {
      await runStep({
        type: "compositor_scene",
        deviceId: preset.compositorDeviceId,
        previousSceneName: capturedState.compositorSceneName,
        sceneName: preset.compositorSceneName
      }, sceneCommand(preset.compositorSceneName));
    }

    if (!capturedState.virtualCameraActive) {
      await runStep({
        type: "virtual_camera",
        deviceId: preset.compositorDeviceId,
        previousActive: false,
        active: true
      }, virtualCameraCommand(true));
    }

    const finalReadiness = await inspectReadiness();
    if (!finalReadiness.summary?.readyForTikTokPreview) {
      throw new Error(`Post-start verification failed: ${readinessIssues(finalReadiness).join(" ")}`);
    }
    await updateSession(session.id, {
      status: "active",
      completedSteps,
      readinessSnapshot: finalReadiness
    });
    return {
      ok: true,
      changed: completedSteps.length > 0,
      sessionId: session.id,
      status: "active",
      completedSteps,
      readiness: finalReadiness,
      message: "Both OBS computers are prepared and OBS Virtual Camera is active. Verify the TikTok LIVE Studio preview and test audio before selecting Go LIVE."
    };
  } catch (error) {
    const restoration = await restoreProduction({
      accessToken,
      session: { ...session, capturedState, completedSteps },
      dispatchCommand,
      updateSession,
      failureMessage: errorMessage(error)
    });
    return {
      ok: false,
      changed: completedSteps.length > 0,
      sessionId: session.id,
      status: restoration.status,
      error: errorMessage(error),
      completedSteps,
      restoration
    };
  }
}

export async function stopCoordinatedProduction({
  accessToken,
  session,
  confirmed,
  dispatchCommand,
  updateSession
}) {
  if (confirmed !== true) throw new Error("Explicit confirmation is required before stopping the dual-PC OBS production and restoring prior state.");
  if (["stopped", "restored_after_failure"].includes(session.status)) {
    return { ok: true, changed: false, sessionId: session.id, status: session.status, message: "This production session was already restored." };
  }
  await updateSession(session.id, { status: "stopping" });
  const restoration = await restoreProduction({ accessToken, session, dispatchCommand, updateSession });
  return {
    ok: restoration.ok,
    changed: restoration.restorationSteps.length > 0,
    sessionId: session.id,
    status: restoration.status,
    restoration,
    message: restoration.ok
      ? "OBS Virtual Camera and both OBS computers were restored to their captured pre-production state. This does not end a TikTok LIVE."
      : "Some OBS state could not be restored. Review the listed computer and step before continuing."
  };
}

export async function restoreProduction({
  accessToken,
  session,
  dispatchCommand,
  updateSession,
  failureMessage = null
}) {
  const restorationSteps = [...(session.restorationSteps || [])];
  const failures = [];
  const completed = [...(session.completedSteps || [])].reverse();

  for (const step of completed) {
    const restoreKey = restorationKey(step);
    if (restorationSteps.some(saved => saved.key === restoreKey && saved.ok)) continue;
    try {
      await dispatchCommand(accessToken, step.deviceId, inverseCommand(step));
      restorationSteps.push({ key: restoreKey, type: step.type, deviceId: step.deviceId, ok: true });
      await updateSession(session.id, { restorationSteps });
    } catch (error) {
      const failure = { key: restoreKey, type: step.type, deviceId: step.deviceId, ok: false, error: errorMessage(error) };
      restorationSteps.push(failure);
      failures.push(failure);
    }
  }

  const status = failures.length > 0
    ? "restore_failed"
    : failureMessage ? "restored_after_failure" : "stopped";
  await updateSession(session.id, {
    status,
    restorationSteps,
    errorSummary: failureMessage || (failures.length ? "One or more restoration steps failed." : null),
    stoppedAt: new Date().toISOString()
  });
  return { ok: failures.length === 0, status, restorationSteps, failures };
}

export function captureProductionState(readiness) {
  const background = readiness.devices?.background?.inspection;
  const compositor = readiness.devices?.compositor?.inspection;
  if (!background || !compositor) throw new Error("Both OBS computers must return readable state before production can start.");
  const backgroundSceneName = background.obs?.currentProgramSceneName;
  const compositorSceneName = compositor.obs?.currentProgramSceneName;
  if (typeof backgroundSceneName !== "string" || typeof compositorSceneName !== "string") {
    throw new Error("Both OBS computers must report their current program scene before production can start.");
  }
  return {
    backgroundSceneName,
    compositorSceneName,
    compositorSources: (compositor.sources || []).map(source => ({ name: source.name, visible: Boolean(source.enabled) })),
    virtualCameraActive: Boolean(compositor.virtualCamera?.outputActive)
  };
}

export function sceneCommand(sceneName) {
  return { tool: "obs_switch_scene", arguments: { sceneName } };
}

export function sourceVisibilityCommand(sceneName, sourceName, visible) {
  return { tool: "obs_set_source_visibility", arguments: { sceneName, sourceName, visible } };
}

export function virtualCameraCommand(active) {
  return { tool: active ? "obs_start_virtual_camera" : "obs_stop_virtual_camera", arguments: {} };
}

function inverseCommand(step) {
  if (step.type === "background_scene" || step.type === "compositor_scene") return sceneCommand(step.previousSceneName);
  if (step.type === "source_visibility") return sourceVisibilityCommand(step.sceneName, step.sourceName, step.previousVisible);
  if (step.type === "virtual_camera") return virtualCameraCommand(step.previousActive);
  throw new Error(`Unsupported restoration step '${step.type}'.`);
}

function restorationKey(step) {
  return [step.type, step.deviceId, step.sceneName, step.sourceName].filter(Boolean).join(":");
}

function readinessIssues(readiness) {
  return [
    ...(readiness.devices?.background?.issues || []),
    ...(readiness.devices?.compositor?.issues || [])
  ].length > 0
    ? [...(readiness.devices?.background?.issues || []), ...(readiness.devices?.compositor?.issues || [])]
    : ["The final OBS Virtual Camera state was not confirmed."];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
