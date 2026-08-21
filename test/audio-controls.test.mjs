import assert from "node:assert/strict";
import test from "node:test";
import { inspectAudioInput, setAudioInputMuted, setAudioInputVolume } from "../dist/audio-controls.js";

test("focused audio inspection returns mute and volume state", async () => {
  const obsCall = async type => type === "GetInputMute"
    ? { inputMuted: true }
    : { inputVolumeDb: -8.5, inputVolumeMul: 0.375 };
  assert.deepEqual(await inspectAudioInput(obsCall, "Mic"), {
    inputName: "Mic",
    inputMuted: true,
    inputVolumeDb: -8.5,
    inputVolumeMul: 0.375
  });
});

test("focused audio inspection rejects an unreadable volume", async () => {
  const obsCall = async type => type === "GetInputMute" ? { inputMuted: false } : {};
  await assert.rejects(() => inspectAudioInput(obsCall, "Mic"), /readable volume/);
});

test("mute changes are state-aware and verify the result", async () => {
  let muted = false;
  let setCount = 0;
  const obsCall = async (type, args) => {
    if (type === "GetInputMute") return { inputMuted: muted };
    if (type === "GetInputVolume") return { inputVolumeDb: -6, inputVolumeMul: 0.5 };
    if (type === "SetInputMute") { muted = args.inputMuted; setCount += 1; }
    return {};
  };
  assert.equal((await setAudioInputMuted(obsCall, "Mic", true)).changed, true);
  assert.equal((await setAudioInputMuted(obsCall, "Mic", true)).changed, false);
  assert.equal(setCount, 1);
});

test("volume changes are bounded, state-aware, and verified", async () => {
  let volumeDb = -6;
  let setCount = 0;
  const obsCall = async (type, args) => {
    if (type === "GetInputMute") return { inputMuted: false };
    if (type === "GetInputVolume") return { inputVolumeDb: volumeDb, inputVolumeMul: 0.5 };
    if (type === "SetInputVolume") { volumeDb = args.inputVolumeDb; setCount += 1; }
    return {};
  };
  assert.equal((await setAudioInputVolume(obsCall, "Music", -12)).changed, true);
  assert.equal((await setAudioInputVolume(obsCall, "Music", -12)).changed, false);
  assert.equal(setCount, 1);
  await assert.rejects(() => setAudioInputVolume(obsCall, "Music", 30), /between -100 dB and \+26 dB/);
});

test("audio controls fail when OBS does not confirm the postcondition", async () => {
  const obsCall = async type => type === "GetInputMute"
    ? { inputMuted: false }
    : { inputVolumeDb: -6, inputVolumeMul: 0.5 };
  await assert.rejects(() => setAudioInputMuted(obsCall, "Mic", true), /did not mute/);
  await assert.rejects(() => setAudioInputVolume(obsCall, "Mic", -12), /did not set/);
});
