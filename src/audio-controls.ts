type ObsCall = (requestType: string, requestData?: Record<string, unknown>) => Promise<any>;

export async function inspectAudioInput(obsCall: ObsCall, inputName: string) {
  const [mute, volume] = await Promise.all([
    obsCall("GetInputMute", { inputName }),
    obsCall("GetInputVolume", { inputName })
  ]);
  const inputVolumeDb = Number(volume.inputVolumeDb);
  if (!Number.isFinite(inputVolumeDb)) throw new Error(`OBS did not report a readable volume for input '${inputName}'.`);
  const inputVolumeMul = Number(volume.inputVolumeMul);
  return {
    inputName,
    inputMuted: Boolean(mute.inputMuted),
    inputVolumeDb,
    inputVolumeMul: Number.isFinite(inputVolumeMul) ? inputVolumeMul : null
  };
}

export async function setAudioInputMuted(obsCall: ObsCall, inputName: string, muted: boolean) {
  const before = await inspectAudioInput(obsCall, inputName);
  if (before.inputMuted === muted) return { ok: true, changed: false, ...before };
  await obsCall("SetInputMute", { inputName, inputMuted: muted });
  const after = await inspectAudioInput(obsCall, inputName);
  if (after.inputMuted !== muted) throw new Error(`OBS did not ${muted ? "mute" : "unmute"} input '${inputName}'.`);
  return { ok: true, changed: true, previousMuted: before.inputMuted, ...after };
}

export async function setAudioInputVolume(obsCall: ObsCall, inputName: string, volumeDb: number) {
  if (!Number.isFinite(volumeDb) || volumeDb < -100 || volumeDb > 26) {
    throw new Error("OBS input volume must be between -100 dB and +26 dB.");
  }
  const before = await inspectAudioInput(obsCall, inputName);
  if (Math.abs(before.inputVolumeDb - volumeDb) <= 0.01) return { ok: true, changed: false, ...before };
  await obsCall("SetInputVolume", { inputName, inputVolumeDb: volumeDb });
  const after = await inspectAudioInput(obsCall, inputName);
  if (Math.abs(after.inputVolumeDb - volumeDb) > 0.01) throw new Error(`OBS did not set input '${inputName}' to ${volumeDb} dB.`);
  return { ok: true, changed: true, previousVolumeDb: before.inputVolumeDb, ...after };
}
