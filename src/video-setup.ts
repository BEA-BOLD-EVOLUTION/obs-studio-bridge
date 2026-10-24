type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export type VideoSetupPreset =
  | "tiktok_portrait_30"
  | "tiktok_portrait_60"
  | "tiktok_landscape_30"
  | "tiktok_landscape_60"
  | "custom";

export type VideoSettings = {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNumerator: number;
  fpsDenominator: number;
};

export type VideoSetupInput = Partial<VideoSettings> & { preset: VideoSetupPreset };

const presets: Record<Exclude<VideoSetupPreset, "custom">, VideoSettings> = {
  tiktok_portrait_30: settings(1080, 1920, 30),
  tiktok_portrait_60: settings(1080, 1920, 60),
  tiktok_landscape_30: settings(1920, 1080, 30),
  tiktok_landscape_60: settings(1920, 1080, 60)
};

function settings(width: number, height: number, fps: number): VideoSettings {
  return {
    baseWidth: width,
    baseHeight: height,
    outputWidth: width,
    outputHeight: height,
    fpsNumerator: fps,
    fpsDenominator: 1
  };
}

export async function inspectVideoSetup(obsCall: ObsCall) {
  const [video, outputList, virtualCamera] = await Promise.all([
    obsCall("GetVideoSettings"),
    obsCall("GetOutputList"),
    obsCall("GetVirtualCamStatus").catch(() => ({ outputActive: false, unavailable: true }))
  ]);
  const outputs = await Promise.all((outputList.outputs ?? []).map(async (output: any) => {
    const outputName = String(output.outputName ?? "");
    if (!outputName) return null;
    const status = await obsCall("GetOutputStatus", { outputName });
    return {
      outputName,
      outputKind: output.outputKind ?? null,
      outputActive: status.outputActive === true,
      outputReconnecting: status.outputReconnecting === true
    };
  }));
  const activeOutputs = outputs.filter((output): output is NonNullable<typeof output> => Boolean(output?.outputActive));
  if (virtualCamera.outputActive === true && !activeOutputs.some(output => /virtual/i.test(output.outputName))) {
    activeOutputs.push({
      outputName: "OBS Virtual Camera",
      outputKind: "virtual_camera",
      outputActive: true,
      outputReconnecting: false
    });
  }
  return {
    video: normalizeVideoSettings(video),
    outputs: outputs.filter(Boolean),
    virtualCamera,
    activeOutputs,
    safeToChange: activeOutputs.length === 0
  };
}

export async function applyVideoSetup(obsCall: ObsCall, input: VideoSetupInput) {
  const desired = resolveVideoSetup(input);
  const inspection = await inspectVideoSetup(obsCall);
  if (!inspection.safeToChange) {
    const names = inspection.activeOutputs.map(output => output.outputName).join(", ");
    throw new Error(`Stop these active OBS outputs before changing video settings: ${names}.`);
  }

  const before = inspection.video;
  if (sameVideoSettings(before, desired)) {
    return { ok: true, changed: false, preset: input.preset, before, after: before, restored: false };
  }

  try {
    await obsCall("SetVideoSettings", desired);
  } catch (error) {
    const observed = await readVideoSettings(obsCall).catch(() => null);
    if (observed && !sameVideoSettings(observed, before)) {
      const restored = await restoreVideoSettings(obsCall, before);
      throw new Error(`${errorMessage(error)} Settings changed unexpectedly; restoration ${restored ? "succeeded" : "failed and requires manual attention"}.`);
    }
    throw error;
  }

  const after = await readVideoSettings(obsCall);
  if (!sameVideoSettings(after, desired)) {
    const restored = await restoreVideoSettings(obsCall, before);
    throw new Error(`OBS did not apply the complete video setup; restoration ${restored ? "succeeded" : "failed and requires manual attention"}.`);
  }

  return { ok: true, changed: true, preset: input.preset, before, after, restored: false };
}

export function resolveVideoSetup(input: VideoSetupInput): VideoSettings {
  if (input.preset !== "custom") {
    const customFields = [
      input.baseWidth,
      input.baseHeight,
      input.outputWidth,
      input.outputHeight,
      input.fpsNumerator,
      input.fpsDenominator
    ];
    if (customFields.some(value => value !== undefined)) {
      throw new Error("Do not provide custom dimensions or FPS when using a named video preset.");
    }
    return { ...presets[input.preset] };
  }

  const resolved: VideoSettings = {
    baseWidth: requiredNumber(input.baseWidth, "baseWidth"),
    baseHeight: requiredNumber(input.baseHeight, "baseHeight"),
    outputWidth: requiredNumber(input.outputWidth, "outputWidth"),
    outputHeight: requiredNumber(input.outputHeight, "outputHeight"),
    fpsNumerator: requiredNumber(input.fpsNumerator, "fpsNumerator"),
    fpsDenominator: requiredNumber(input.fpsDenominator, "fpsDenominator")
  };
  validateVideoSettings(resolved);
  return resolved;
}

async function readVideoSettings(obsCall: ObsCall): Promise<VideoSettings> {
  return normalizeVideoSettings(await obsCall("GetVideoSettings"));
}

async function restoreVideoSettings(obsCall: ObsCall, before: VideoSettings): Promise<boolean> {
  try {
    await obsCall("SetVideoSettings", before);
    return sameVideoSettings(await readVideoSettings(obsCall), before);
  } catch {
    return false;
  }
}

function normalizeVideoSettings(value: any): VideoSettings {
  const normalized: VideoSettings = {
    baseWidth: Number(value.baseWidth),
    baseHeight: Number(value.baseHeight),
    outputWidth: Number(value.outputWidth),
    outputHeight: Number(value.outputHeight),
    fpsNumerator: Number(value.fpsNumerator),
    fpsDenominator: Number(value.fpsDenominator)
  };
  validateVideoSettings(normalized);
  return normalized;
}

function validateVideoSettings(value: VideoSettings): void {
  for (const [name, dimension] of Object.entries({
    baseWidth: value.baseWidth,
    baseHeight: value.baseHeight,
    outputWidth: value.outputWidth,
    outputHeight: value.outputHeight
  })) {
    if (!Number.isInteger(dimension) || dimension < 8 || dimension > 4096) {
      throw new Error(`${name} must be a whole number between 8 and 4096.`);
    }
  }
  if (!Number.isInteger(value.fpsNumerator) || value.fpsNumerator < 1 || value.fpsNumerator > 240000) {
    throw new Error("fpsNumerator must be a whole number between 1 and 240000.");
  }
  if (!Number.isInteger(value.fpsDenominator) || value.fpsDenominator < 1 || value.fpsDenominator > 1001) {
    throw new Error("fpsDenominator must be a whole number between 1 and 1001.");
  }
  const fps = value.fpsNumerator / value.fpsDenominator;
  if (fps < 1 || fps > 120) throw new Error("The resulting FPS must be between 1 and 120.");
}

function sameVideoSettings(left: VideoSettings, right: VideoSettings): boolean {
  return Object.keys(right).every(key => left[key as keyof VideoSettings] === right[key as keyof VideoSettings]);
}

function requiredNumber(value: number | undefined, name: string): number {
  if (value === undefined) throw new Error(`${name} is required for a custom video setup.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
