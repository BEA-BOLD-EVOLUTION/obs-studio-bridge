type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export type ProductionInspectionRequest = {
  sceneName: string;
  sourceNames?: string[];
};

export async function inspectProductionResources(
  obsCall: ObsCall,
  { sceneName, sourceNames = [] }: ProductionInspectionRequest
) {
  const [version, sceneList, sceneItems, video, virtualCamera] = await Promise.all([
    obsCall("GetVersion"),
    obsCall("GetSceneList"),
    obsCall("GetSceneItemList", { sceneName }).catch((error) => ({ unavailable: errorMessage(error), sceneItems: [] })),
    obsCall("GetVideoSettings"),
    obsCall("GetVirtualCamStatus").catch((error) => ({ unavailable: errorMessage(error) }))
  ]);

  const sceneExists = (sceneList.scenes ?? []).some((scene: any) => scene.sceneName === sceneName);
  const items = sceneExists ? (sceneItems.sceneItems ?? []) : [];
  const sources = sourceNames.map(sourceName => {
    const item = items.find((candidate: any) => candidate.sourceName === sourceName);
    return {
      name: sourceName,
      exists: Boolean(item),
      enabled: item ? Boolean(item.sceneItemEnabled) : false
    };
  });

  return {
    obs: {
      obsVersion: version.obsVersion,
      obsWebSocketVersion: version.obsWebSocketVersion,
      currentProgramSceneName: sceneList.currentProgramSceneName
    },
    scene: { name: sceneName, exists: sceneExists },
    sources,
    video,
    virtualCamera
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
