type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

type SceneSummary = {
  sceneName: string;
  sceneUuid?: string;
  sceneIndex?: number;
};

function normalizeSceneName(value: string, label = "Scene name"): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty.`);
  if (normalized.length > 120) throw new Error(`${label} cannot exceed 120 characters.`);
  return normalized;
}

async function getSceneState(obsCall: ObsCall) {
  const response = await obsCall("GetSceneList");
  const scenes: SceneSummary[] = Array.isArray(response.scenes)
    ? response.scenes.map((scene: any) => ({
      sceneName: String(scene.sceneName ?? ""),
      ...(scene.sceneUuid ? { sceneUuid: String(scene.sceneUuid) } : {}),
      ...(Number.isInteger(scene.sceneIndex) ? { sceneIndex: Number(scene.sceneIndex) } : {})
    })).filter((scene: SceneSummary) => scene.sceneName)
    : [];
  return {
    scenes,
    currentProgramSceneName: response.currentProgramSceneName == null
      ? null
      : String(response.currentProgramSceneName),
    currentPreviewSceneName: response.currentPreviewSceneName == null
      ? null
      : String(response.currentPreviewSceneName)
  };
}

export async function createScene(obsCall: ObsCall, requestedSceneName: string) {
  const sceneName = normalizeSceneName(requestedSceneName);
  const before = await getSceneState(obsCall);
  if (before.scenes.some(scene => scene.sceneName === sceneName)) {
    return { ok: true, changed: false, sceneName, reason: "Scene already exists." };
  }

  const created = await obsCall("CreateScene", { sceneName });
  const after = await getSceneState(obsCall);
  const scene = after.scenes.find(candidate => candidate.sceneName === sceneName);
  if (!scene) throw new Error(`OBS did not create scene '${sceneName}'.`);
  return {
    ok: true,
    changed: true,
    sceneName,
    sceneUuid: scene.sceneUuid ?? created.sceneUuid
  };
}

export async function renameScene(
  obsCall: ObsCall,
  requestedSceneName: string,
  requestedNewSceneName: string
) {
  const sceneName = normalizeSceneName(requestedSceneName, "Current scene name");
  const newSceneName = normalizeSceneName(requestedNewSceneName, "New scene name");
  const before = await getSceneState(obsCall);
  if (!before.scenes.some(scene => scene.sceneName === sceneName)) {
    throw new Error(`Scene '${sceneName}' does not exist.`);
  }
  if (sceneName === newSceneName) {
    return { ok: true, changed: false, sceneName, newSceneName };
  }
  if (before.scenes.some(scene => scene.sceneName === newSceneName)) {
    throw new Error(`Scene '${newSceneName}' already exists.`);
  }

  await obsCall("SetSceneName", { sceneName, newSceneName });
  const after = await getSceneState(obsCall);
  if (after.scenes.some(scene => scene.sceneName === sceneName)
      || !after.scenes.some(scene => scene.sceneName === newSceneName)) {
    throw new Error(`OBS did not rename scene '${sceneName}' to '${newSceneName}'.`);
  }
  return { ok: true, changed: true, sceneName, newSceneName };
}

export async function duplicateScene(
  obsCall: ObsCall,
  requestedSceneName: string,
  requestedNewSceneName: string
) {
  const sceneName = normalizeSceneName(requestedSceneName, "Source scene name");
  const newSceneName = normalizeSceneName(requestedNewSceneName, "New scene name");
  const before = await getSceneState(obsCall);
  if (!before.scenes.some(scene => scene.sceneName === sceneName)) {
    throw new Error(`Scene '${sceneName}' does not exist.`);
  }
  if (before.scenes.some(scene => scene.sceneName === newSceneName)) {
    throw new Error(`Scene '${newSceneName}' already exists.`);
  }

  const source = await obsCall("GetSceneItemList", { sceneName });
  const sourceItems = Array.isArray(source.sceneItems)
    ? [...source.sceneItems].sort((left, right) => Number(left.sceneItemIndex) - Number(right.sceneItemIndex))
    : [];
  await obsCall("CreateScene", { sceneName: newSceneName });

  try {
    for (const item of sourceItems) {
      const duplicated = await obsCall("DuplicateSceneItem", {
        sceneName,
        sceneItemId: item.sceneItemId,
        destinationSceneName: newSceneName
      });
      if (typeof item.sceneItemEnabled === "boolean") {
        await obsCall("SetSceneItemEnabled", {
          sceneName: newSceneName,
          sceneItemId: duplicated.sceneItemId,
          sceneItemEnabled: item.sceneItemEnabled
        });
      }
    }

    const [after, destination] = await Promise.all([
      getSceneState(obsCall),
      obsCall("GetSceneItemList", { sceneName: newSceneName })
    ]);
    const destinationItems = Array.isArray(destination.sceneItems)
      ? [...destination.sceneItems].sort((left, right) => Number(left.sceneItemIndex) - Number(right.sceneItemIndex))
      : [];
    if (!after.scenes.some(scene => scene.sceneName === newSceneName)
        || !sceneItemsMatch(sourceItems, destinationItems)) {
      throw new Error(`OBS did not fully duplicate scene '${sceneName}'.`);
    }
    return {
      ok: true,
      changed: true,
      sceneName,
      newSceneName,
      duplicatedItemCount: destinationItems.length
    };
  } catch (error) {
    try {
      await obsCall("RemoveScene", { sceneName: newSceneName });
    } catch (rollbackError) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} `
        + `Cleanup also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      );
    }
    throw error;
  }
}

function sceneItemsMatch(sourceItems: any[], destinationItems: any[]): boolean {
  if (sourceItems.length !== destinationItems.length) return false;
  return sourceItems.every((source, index) => {
    const destination = destinationItems[index];
    if (!destination) return false;
    if (source.sourceUuid && destination.sourceUuid) {
      if (source.sourceUuid !== destination.sourceUuid) return false;
    } else if (source.sourceName !== destination.sourceName) {
      return false;
    }
    return Number(source.sceneItemIndex) === Number(destination.sceneItemIndex)
      && Boolean(source.sceneItemEnabled) === Boolean(destination.sceneItemEnabled)
      && JSON.stringify(source.sceneItemTransform ?? null) === JSON.stringify(destination.sceneItemTransform ?? null);
  });
}

export async function removeScene(
  obsCall: ObsCall,
  requestedSceneName: string,
  requestedConfirmedSceneName: string
) {
  const sceneName = normalizeSceneName(requestedSceneName);
  const confirmedSceneName = normalizeSceneName(requestedConfirmedSceneName, "Confirmed scene name");
  if (sceneName !== confirmedSceneName) {
    throw new Error("The confirmed scene name must exactly match the scene being removed.");
  }

  const before = await getSceneState(obsCall);
  if (!before.scenes.some(scene => scene.sceneName === sceneName)) {
    throw new Error(`Scene '${sceneName}' does not exist.`);
  }
  if (before.scenes.length <= 1) {
    throw new Error("OBS must keep at least one scene.");
  }
  if (before.currentProgramSceneName === sceneName) {
    throw new Error(`Cannot remove current program scene '${sceneName}'. Switch scenes first.`);
  }
  if (before.currentPreviewSceneName === sceneName) {
    throw new Error(`Cannot remove current preview scene '${sceneName}'. Change the preview first.`);
  }

  await obsCall("RemoveScene", { sceneName });
  const after = await getSceneState(obsCall);
  if (after.scenes.some(scene => scene.sceneName === sceneName)) {
    throw new Error(`OBS did not remove scene '${sceneName}'.`);
  }
  return { ok: true, changed: true, removedSceneName: sceneName };
}

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
