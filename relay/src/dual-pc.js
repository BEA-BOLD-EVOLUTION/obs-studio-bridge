export const PRODUCTION_ROLES = ["background", "camera_compositor"];
export const OUTPUT_TYPE = "tiktok_live_studio_virtual_camera";

export function presetRecord(input) {
  if (input.backgroundDeviceId === input.compositorDeviceId) {
    throw new Error("Background and Camera/Compositor must be different computers.");
  }

  return {
    name: input.name.trim(),
    background_device_id: input.backgroundDeviceId,
    background_scene_name: input.backgroundSceneName.trim(),
    compositor_device_id: input.compositorDeviceId,
    compositor_scene_name: input.compositorSceneName.trim(),
    receiving_source_name: input.receivingSourceName.trim(),
    camera_source_name: input.cameraSourceName?.trim() || null,
    overlay_source_names: uniqueNames(input.overlaySourceNames || []),
    output_type: OUTPUT_TYPE,
    expected_width: input.expectedWidth,
    expected_height: input.expectedHeight,
    expected_fps: input.expectedFps,
    tiktok_audio_configured_separately: input.tiktokAudioConfiguredSeparately
  };
}

export function publicPreset(row) {
  return {
    id: row.id,
    name: row.name,
    backgroundDeviceId: row.background_device_id,
    backgroundSceneName: row.background_scene_name,
    compositorDeviceId: row.compositor_device_id,
    compositorSceneName: row.compositor_scene_name,
    receivingSourceName: row.receiving_source_name,
    cameraSourceName: row.camera_source_name,
    overlaySourceNames: row.overlay_source_names || [],
    outputType: row.output_type,
    expectedWidth: row.expected_width,
    expectedHeight: row.expected_height,
    expectedFps: Number(row.expected_fps),
    tiktokAudioConfiguredSeparately: row.tiktok_audio_configured_separately,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function inspectionCommand(sceneName, sourceNames = []) {
  return {
    tool: "obs_inspect_production_resources",
    arguments: { sceneName, sourceNames: uniqueNames(sourceNames) }
  };
}

export function toolPayload(dispatchResult) {
  const content = dispatchResult?.response?.result?.content;
  const text = Array.isArray(content) ? content.find(item => item?.type === "text")?.text : null;
  if (typeof text !== "string") throw new Error("OBS computer returned an unreadable readiness result.");
  return JSON.parse(text);
}

export function evaluateInspection({ role, device, inspection, expected, requiredSources = [], allowDisabledSources = false }) {
  const issues = [];
  if (device.productionRole !== role) {
    issues.push(`Computer '${device.name || device.id}' is no longer assigned the required '${role}' role.`);
  }
  if (!inspection.scene?.exists) issues.push(`Scene '${expected.sceneName}' was not found.`);
  for (const sourceName of requiredSources) {
    const source = inspection.sources?.find(candidate => candidate.name === sourceName);
    if (!source?.exists) issues.push(`Source '${sourceName}' was not found in '${expected.sceneName}'.`);
    else if (!source.enabled && !allowDisabledSources) issues.push(`Source '${sourceName}' is disabled in '${expected.sceneName}'.`);
  }

  const video = inspection.video || {};
  if (Number(video.outputWidth) !== expected.width || Number(video.outputHeight) !== expected.height) {
    issues.push(`Output resolution is ${video.outputWidth ?? "unknown"}x${video.outputHeight ?? "unknown"}; expected ${expected.width}x${expected.height}.`);
  }
  const actualFps = Number(video.fpsNumerator || 0) / Number(video.fpsDenominator || 1);
  if (!Number.isFinite(actualFps) || Math.abs(actualFps - expected.fps) > 0.01) {
    issues.push(`Frame rate is ${Number.isFinite(actualFps) ? actualFps : "unknown"}; expected ${expected.fps}.`);
  }
  if (role === "camera_compositor" && inspection.virtualCamera?.unavailable) {
    issues.push("OBS Virtual Camera is unavailable on the Camera/Compositor computer.");
  }

  return {
    role,
    device,
    ready: issues.length === 0,
    issues,
    inspection
  };
}

export function readinessSummary(background, compositor, audioAcknowledged) {
  const obsReady = background.ready && compositor.ready;
  const virtualCameraActive = Boolean(compositor.inspection?.virtualCamera?.outputActive);
  return {
    obsReady,
    readyForVirtualCameraStart: obsReady,
    readyForTikTokPreview: obsReady && virtualCameraActive && audioAcknowledged,
    virtualCameraActive,
    audioConfiguredSeparately: audioAcknowledged,
    reminder: "Verify the video preview and test audio in TikTok LIVE Studio. OBS Creator Assistant does not start a TikTok LIVE."
  };
}

function uniqueNames(names) {
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}
