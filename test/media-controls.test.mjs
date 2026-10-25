import assert from "node:assert/strict";
import test from "node:test";
import { controlMediaInput, inspectMediaInputs } from "../dist/media-controls.js";

test("media inspection returns only controllable OBS media inputs", async () => {
  const obsCall = async (type, args) => {
    if (type === "GetInputList") return { inputs: [
      { inputName: "Jump Scare 1", inputKind: "ffmpeg_source", inputUuid: "media-1" },
      { inputName: "Main Camera", inputKind: "dshow_input", inputUuid: "camera-1" }
    ] };
    if (type === "GetMediaInputStatus" && args.inputName === "Jump Scare 1") {
      return { mediaState: "OBS_MEDIA_STATE_STOPPED", mediaCursor: 0, mediaDuration: 4200 };
    }
    throw new Error("not media");
  };

  const result = await inspectMediaInputs(obsCall);
  assert.equal(result.count, 1);
  assert.deepEqual(result.inputs[0], {
    inputName: "Jump Scare 1",
    inputKind: "ffmpeg_source",
    inputUuid: "media-1",
    mediaState: "OBS_MEDIA_STATE_STOPPED",
    mediaCursor: 0,
    mediaDuration: 4200
  });
});

test("media control validates the source, performs the action, and verifies state", async () => {
  let state = "OBS_MEDIA_STATE_STOPPED";
  const calls = [];
  const obsCall = async (type, args) => {
    calls.push([type, args]);
    if (type === "GetInputList") return { inputs: [{ inputName: "Jump Scare 2", inputKind: "ffmpeg_source" }] };
    if (type === "GetMediaInputStatus") return { mediaState: state, mediaCursor: 0, mediaDuration: 1000 };
    if (type === "TriggerMediaInputAction") state = "OBS_MEDIA_STATE_PLAYING";
    return {};
  };

  const result = await controlMediaInput(obsCall, "Jump Scare 2", "play");
  assert.equal(result.changed, true);
  assert.equal(result.mediaState, "OBS_MEDIA_STATE_PLAYING");
  assert.deepEqual(calls.find(([type]) => type === "TriggerMediaInputAction")?.[1], {
    inputName: "Jump Scare 2",
    mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY"
  });
});

test("media control is idempotent for already settled play, pause, and stop actions", async () => {
  for (const [action, mediaState] of [
    ["play", "OBS_MEDIA_STATE_PLAYING"],
    ["pause", "OBS_MEDIA_STATE_PAUSED"],
    ["stop", "OBS_MEDIA_STATE_STOPPED"]
  ]) {
    let triggered = false;
    const obsCall = async type => {
      if (type === "GetInputList") return { inputs: [{ inputName: "Effect", inputKind: "ffmpeg_source" }] };
      if (type === "GetMediaInputStatus") return { mediaState };
      if (type === "TriggerMediaInputAction") triggered = true;
      return {};
    };
    const result = await controlMediaInput(obsCall, "Effect", action);
    assert.equal(result.changed, false);
    assert.equal(triggered, false);
  }
});

test("media control rejects missing and non-media OBS inputs", async () => {
  await assert.rejects(
    () => controlMediaInput(async type => type === "GetInputList" ? { inputs: [] } : {}, "Missing", "play"),
    /does not exist/
  );
  await assert.rejects(
    () => controlMediaInput(async type => {
      if (type === "GetInputList") return { inputs: [{ inputName: "Camera", inputKind: "dshow_input" }] };
      throw new Error("unsupported");
    }, "Camera", "play"),
    /not a controllable media source/
  );
});

test("media control fails when OBS does not report the requested postcondition", async () => {
  const obsCall = async type => {
    if (type === "GetInputList") return { inputs: [{ inputName: "Effect", inputKind: "ffmpeg_source" }] };
    if (type === "GetMediaInputStatus") return { mediaState: "OBS_MEDIA_STATE_STOPPED" };
    return {};
  };
  await assert.rejects(() => controlMediaInput(obsCall, "Effect", "play"), /did not play/);
});
