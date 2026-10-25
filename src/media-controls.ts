type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export const mediaActions = ["play", "pause", "stop", "restart"] as const;
export type MediaAction = typeof mediaActions[number];

const obsActions: Record<MediaAction, string> = {
  play: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
  pause: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
  stop: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
  restart: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
};

const settledStates: Record<MediaAction, Set<string>> = {
  play: new Set(["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_OPENING", "OBS_MEDIA_STATE_BUFFERING"]),
  pause: new Set(["OBS_MEDIA_STATE_PAUSED"]),
  stop: new Set(["OBS_MEDIA_STATE_STOPPED", "OBS_MEDIA_STATE_ENDED"]),
  restart: new Set(["OBS_MEDIA_STATE_PLAYING", "OBS_MEDIA_STATE_OPENING", "OBS_MEDIA_STATE_BUFFERING"])
};

function normalizeInputs(response: any): Array<{ inputName: string; inputKind?: string; inputUuid?: string }> {
  return Array.isArray(response?.inputs)
    ? response.inputs.filter((input: any) => typeof input?.inputName === "string" && input.inputName.length > 0)
    : [];
}

async function inspectOne(obsCall: ObsCall, input: { inputName: string; inputKind?: string; inputUuid?: string }) {
  try {
    const status = await obsCall("GetMediaInputStatus", { inputName: input.inputName });
    return {
      inputName: input.inputName,
      inputKind: input.inputKind ?? null,
      inputUuid: input.inputUuid ?? null,
      mediaState: status.mediaState ?? null,
      mediaCursor: status.mediaCursor ?? null,
      mediaDuration: status.mediaDuration ?? null
    };
  } catch {
    return null;
  }
}

export async function inspectMediaInputs(obsCall: ObsCall) {
  const inputList = await obsCall("GetInputList");
  const inspected = await Promise.all(normalizeInputs(inputList).map(input => inspectOne(obsCall, input)));
  const inputs = inspected.filter((input): input is NonNullable<typeof input> => input !== null);
  return { count: inputs.length, inputs };
}

export async function controlMediaInput(obsCall: ObsCall, inputName: string, action: MediaAction) {
  const inputList = await obsCall("GetInputList");
  const input = normalizeInputs(inputList).find(candidate => candidate.inputName === inputName);
  if (!input) throw new Error(`OBS input '${inputName}' does not exist.`);

  let before: any;
  try {
    before = await obsCall("GetMediaInputStatus", { inputName });
  } catch {
    throw new Error(`OBS input '${inputName}' is not a controllable media source.`);
  }

  if (action !== "restart" && settledStates[action].has(String(before.mediaState))) {
    return {
      ok: true,
      changed: false,
      inputName,
      inputKind: input.inputKind ?? null,
      action,
      mediaState: before.mediaState ?? null,
      mediaCursor: before.mediaCursor ?? null,
      mediaDuration: before.mediaDuration ?? null
    };
  }

  await obsCall("TriggerMediaInputAction", { inputName, mediaAction: obsActions[action] });
  const after = await obsCall("GetMediaInputStatus", { inputName });
  if (!settledStates[action].has(String(after.mediaState))) {
    throw new Error(`OBS did not ${action} media source '${inputName}'. Reported state: ${String(after.mediaState ?? "unknown")}.`);
  }

  return {
    ok: true,
    changed: true,
    inputName,
    inputKind: input.inputKind ?? null,
    action,
    previousMediaState: before.mediaState ?? null,
    mediaState: after.mediaState ?? null,
    mediaCursor: after.mediaCursor ?? null,
    mediaDuration: after.mediaDuration ?? null
  };
}
