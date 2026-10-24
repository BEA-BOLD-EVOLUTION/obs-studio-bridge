import { listWindowsCameraCandidates, type CommandRunner } from "./desktop-integration.js";

type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export type CameraLayout = "fullscreen" | "side_by_side" | "picture_in_picture" | "three_camera" | "grid";

export async function discoverCameras(obsCall: ObsCall, runner?: CommandRunner) {
  const [inputList, windows] = await Promise.all([
    obsCall("GetInputList", { inputKind: "dshow_input" }),
    listWindowsCameraCandidates(runner).catch((error) => ({
      supported: process.platform === "win32",
      cameras: [],
      warning: error instanceof Error ? error.message : String(error)
    }))
  ]);

  const obsSources = await Promise.all((inputList.inputs ?? []).map(async (input: any) => {
    const inputName = String(input.inputName ?? "");
    const [settings, active] = await Promise.all([
      obsCall("GetInputSettings", { inputName }),
      obsCall("GetInputActiveState", { inputName }).catch(() => ({ inputActive: null, inputShow: null }))
    ]);
    return {
      inputName,
      inputKind: String(input.inputKind ?? "dshow_input"),
      videoDeviceId: settings.inputSettings?.video_device_id ?? null,
      videoDeviceName: settings.inputSettings?.video_device_name ?? null,
      active: active.inputActive,
      showing: active.inputShow
    };
  }));

  return {
    obsSources,
    windowsCandidates: ((windows as any).cameras ?? []).filter((camera: any) => camera.kind !== "virtual"),
    virtualCameraDevices: ((windows as any).cameras ?? []).filter((camera: any) => camera.kind === "virtual"),
    windowsWarning: (windows as any).warning ?? null,
    identificationRequired: true,
    nextStep: "Show each camera locally and ask the creator to label it Main, Overhead, Side, Pet Cam, Phone, or a custom role."
  };
}

export async function createCameraLayout(
  obsCall: ObsCall,
  input: { sceneName: string; layout: CameraLayout; cameraSourceNames: string[] }
) {
  validateLayout(input.layout, input.cameraSourceNames);
  const allInputs = await obsCall("GetInputList");
  const cameraInputs = new Set((allInputs.inputs ?? [])
    .filter((candidate: any) => candidate.inputKind === "dshow_input")
    .map((candidate: any) => candidate.inputName));
  for (const sourceName of input.cameraSourceNames) {
    if (!cameraInputs.has(sourceName)) throw new Error(`OBS camera source '${sourceName}' was not found.`);
  }

  const video = await obsCall("GetVideoSettings");
  const width = Number(video.baseWidth);
  const height = Number(video.baseHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("OBS did not report a valid canvas size.");
  }

  const scenes = await obsCall("GetSceneList");
  const sceneExists = (scenes.scenes ?? []).some((scene: any) => scene.sceneName === input.sceneName);
  if (!sceneExists) await obsCall("CreateScene", { sceneName: input.sceneName });
  for (const sourceName of input.cameraSourceNames) {
    await ensureSceneItem(obsCall, input.sceneName, sourceName);
  }

  const placements = layoutPlacements(input.layout, input.cameraSourceNames.length, width, height);
  const applied = [];
  for (let index = 0; index < input.cameraSourceNames.length; index += 1) {
    const sourceName = input.cameraSourceNames[index]!;
    const sceneItem = await obsCall("GetSceneItemId", { sceneName: input.sceneName, sourceName });
    const placement = placements[index]!;
    await obsCall("SetSceneItemTransform", {
      sceneName: input.sceneName,
      sceneItemId: sceneItem.sceneItemId,
      sceneItemTransform: {
        positionX: placement.x,
        positionY: placement.y,
        boundsType: "OBS_BOUNDS_SCALE_OUTER",
        boundsWidth: placement.width,
        boundsHeight: placement.height,
        boundsAlignment: 0
      }
    });
    await obsCall("SetSceneItemEnabled", {
      sceneName: input.sceneName,
      sceneItemId: sceneItem.sceneItemId,
      sceneItemEnabled: true
    });
    const verified = await obsCall("GetSceneItemTransform", {
      sceneName: input.sceneName,
      sceneItemId: sceneItem.sceneItemId
    });
    assertVerifiedPlacement(sourceName, placement, verified.sceneItemTransform);
    applied.push({ sourceName, sceneItemId: sceneItem.sceneItemId, transform: verified.sceneItemTransform });
  }

  return {
    ok: true,
    changed: true,
    sceneCreated: !sceneExists,
    sceneName: input.sceneName,
    layout: input.layout,
    canvas: { width, height },
    cameras: applied
  };
}

function assertVerifiedPlacement(
  sourceName: string,
  expected: { x: number; y: number; width: number; height: number },
  actual: any
): void {
  const checks: Array<[string, number, unknown]> = [
    ["positionX", expected.x, actual?.positionX],
    ["positionY", expected.y, actual?.positionY],
    ["boundsWidth", expected.width, actual?.boundsWidth],
    ["boundsHeight", expected.height, actual?.boundsHeight]
  ];
  const matches = actual?.boundsType === "OBS_BOUNDS_SCALE_OUTER"
    && checks.every(([, wanted, received]) => typeof received === "number" && Math.abs(received - wanted) < 0.01);
  if (!matches) throw new Error(`OBS did not apply the verified camera placement for '${sourceName}'.`);
}

async function ensureSceneItem(obsCall: ObsCall, sceneName: string, sourceName: string): Promise<void> {
  try {
    await obsCall("GetSceneItemId", { sceneName, sourceName });
  } catch {
    await obsCall("CreateSceneItem", { sceneName, sourceName, sceneItemEnabled: false });
  }
}

function validateLayout(layout: CameraLayout, sources: string[]): void {
  if (sources.length < 1 || sources.length > 4) throw new Error("Choose between one and four camera sources.");
  const required: Record<CameraLayout, [number, number]> = {
    fullscreen: [1, 1],
    side_by_side: [2, 2],
    picture_in_picture: [2, 2],
    three_camera: [3, 3],
    grid: [2, 4]
  };
  const [minimum, maximum] = required[layout];
  if (sources.length < minimum || sources.length > maximum) {
    throw new Error(`Layout '${layout}' requires ${minimum === maximum ? minimum : `${minimum}-${maximum}`} camera sources.`);
  }
  if (new Set(sources).size !== sources.length) throw new Error("Each camera source can appear only once in a layout.");
}

function layoutPlacements(layout: CameraLayout, count: number, width: number, height: number) {
  if (layout === "fullscreen") return [{ x: 0, y: 0, width, height }];
  if (layout === "side_by_side") {
    return [0, 1].map(index => ({ x: index * width / 2, y: 0, width: width / 2, height }));
  }
  if (layout === "picture_in_picture") {
    const pipWidth = width * 0.32;
    const pipHeight = height * 0.32;
    const margin = Math.max(16, Math.round(Math.min(width, height) * 0.02));
    return [
      { x: 0, y: 0, width, height },
      { x: width - pipWidth - margin, y: height - pipHeight - margin, width: pipWidth, height: pipHeight }
    ];
  }
  if (layout === "three_camera") {
    return [
      { x: 0, y: 0, width, height: height * 0.62 },
      { x: 0, y: height * 0.62, width: width / 2, height: height * 0.38 },
      { x: width / 2, y: height * 0.62, width: width / 2, height: height * 0.38 }
    ];
  }
  const columns = 2;
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => ({
    x: (index % columns) * width / columns,
    y: Math.floor(index / columns) * height / rows,
    width: width / columns,
    height: height / rows
  }));
}
