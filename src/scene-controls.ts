type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export async function setProgramScene(obsCall: ObsCall, sceneName: string) {
  const before = await obsCall("GetCurrentProgramScene");
  if (before.currentProgramSceneName === sceneName) {
    return { ok: true, changed: false, currentProgramSceneName: sceneName };
  }

  await obsCall("SetCurrentProgramScene", { sceneName });
  const after = await obsCall("GetCurrentProgramScene");
  if (after.currentProgramSceneName !== sceneName) {
    throw new Error(`OBS did not switch to scene '${sceneName}'.`);
  }
  return {
    ok: true,
    changed: true,
    previousProgramSceneName: before.currentProgramSceneName,
    currentProgramSceneName: sceneName
  };
}

export async function setSceneSourceVisibility(
  obsCall: ObsCall,
  sceneName: string,
  sourceName: string,
  visible: boolean
) {
  const item = await obsCall("GetSceneItemId", { sceneName, sourceName });
  const request = { sceneName, sceneItemId: item.sceneItemId };
  const before = await obsCall("GetSceneItemEnabled", request);
  if (Boolean(before.sceneItemEnabled) === visible) {
    return { ok: true, changed: false, sceneName, sourceName, visible };
  }

  await obsCall("SetSceneItemEnabled", { ...request, sceneItemEnabled: visible });
  const after = await obsCall("GetSceneItemEnabled", request);
  if (Boolean(after.sceneItemEnabled) !== visible) {
    throw new Error(`OBS did not ${visible ? "show" : "hide"} source '${sourceName}' in '${sceneName}'.`);
  }
  return { ok: true, changed: true, sceneName, sourceName, visible };
}
