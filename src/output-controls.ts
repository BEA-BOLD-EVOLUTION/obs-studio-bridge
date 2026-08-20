export type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export type VirtualCameraStatus = {
  available: boolean;
  outputActive: boolean;
  status: unknown;
};

export type VirtualCameraControlResult = VirtualCameraStatus & {
  ok: true;
  changed: boolean;
  requestedActive: boolean;
  response?: unknown;
};

export type VirtualCameraControlOptions = {
  verificationAttempts?: number;
  verificationDelayMs?: number;
  sleep?: (durationMs: number) => Promise<void>;
};

export async function inspectVirtualCamera(obsCall: ObsCall): Promise<VirtualCameraStatus> {
  const status = await obsCall("GetVirtualCamStatus");
  return {
    available: true,
    outputActive: Boolean(status?.outputActive),
    status
  };
}

export async function setVirtualCameraActive(
  obsCall: ObsCall,
  requestedActive: boolean,
  options: VirtualCameraControlOptions = {}
): Promise<VirtualCameraControlResult> {
  const before = await inspectVirtualCamera(obsCall);

  if (before.outputActive === requestedActive) {
    return {
      ok: true,
      changed: false,
      requestedActive,
      ...before
    };
  }

  const response = await obsCall(requestedActive ? "StartVirtualCam" : "StopVirtualCam");
  const attempts = Math.max(1, options.verificationAttempts ?? 10);
  const delayMs = Math.max(0, options.verificationDelayMs ?? 100);
  const sleep = options.sleep ?? ((durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs)));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const after = await inspectVirtualCamera(obsCall);
    if (after.outputActive === requestedActive) {
      return {
        ok: true,
        changed: true,
        requestedActive,
        response,
        ...after
      };
    }
    if (attempt < attempts) await sleep(delayMs);
  }

  throw new Error(
    `OBS accepted the virtual camera request but did not report it ${requestedActive ? "active" : "inactive"} afterward.`
  );
}
