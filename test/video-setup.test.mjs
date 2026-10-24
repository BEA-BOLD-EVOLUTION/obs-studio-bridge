import assert from "node:assert/strict";
import test from "node:test";
import { applyVideoSetup, inspectVideoSetup, resolveVideoSetup } from "../dist/video-setup.js";

const portrait30 = {
  baseWidth: 1080,
  baseHeight: 1920,
  outputWidth: 1080,
  outputHeight: 1920,
  fpsNumerator: 30,
  fpsDenominator: 1
};

function fakeObs({ video = portrait30, outputs = [], virtualCamera = false, appliedVideo } = {}) {
  let current = { ...video };
  const calls = [];
  return {
    calls,
    call: async (type, args = {}) => {
      calls.push([type, args]);
      if (type === "GetVideoSettings") return { ...current };
      if (type === "GetOutputList") return { outputs };
      if (type === "GetOutputStatus") {
        const output = outputs.find(candidate => candidate.outputName === args.outputName);
        return { outputActive: output?.outputActive === true, outputReconnecting: false };
      }
      if (type === "GetVirtualCamStatus") return { outputActive: virtualCamera };
      if (type === "SetVideoSettings") {
        current = appliedVideo ? { ...appliedVideo } : { ...args };
        return {};
      }
      throw new Error(`Unexpected ${type}`);
    }
  };
}

test("named TikTok presets include canvas, output, and FPS", () => {
  assert.deepEqual(resolveVideoSetup({ preset: "tiktok_portrait_30" }), portrait30);
  assert.deepEqual(resolveVideoSetup({ preset: "tiktok_landscape_60" }), {
    baseWidth: 1920,
    baseHeight: 1080,
    outputWidth: 1920,
    outputHeight: 1080,
    fpsNumerator: 60,
    fpsDenominator: 1
  });
});

test("custom setup requires and validates every field", () => {
  assert.throws(() => resolveVideoSetup({ preset: "custom", baseWidth: 1080 }), /baseHeight is required/);
  assert.throws(() => resolveVideoSetup({
    preset: "custom",
    baseWidth: 1080,
    baseHeight: 1920,
    outputWidth: 1080,
    outputHeight: 1920,
    fpsNumerator: 300,
    fpsDenominator: 1
  }), /between 1 and 120/);
});

test("inspection reports every active output and virtual camera", async () => {
  const obs = fakeObs({
    outputs: [{ outputName: "adv_stream", outputKind: "rtmp_output", outputActive: true }],
    virtualCamera: true
  });
  const result = await inspectVideoSetup(obs.call);
  assert.equal(result.safeToChange, false);
  assert.deepEqual(result.activeOutputs.map(output => output.outputName), ["adv_stream", "OBS Virtual Camera"]);
});

test("video setup refuses to change while an output is active", async () => {
  const obs = fakeObs({ outputs: [{ outputName: "recording", outputActive: true }] });
  await assert.rejects(() => applyVideoSetup(obs.call, { preset: "tiktok_landscape_30" }), /Stop these active OBS outputs.*recording/);
  assert.equal(obs.calls.some(([type]) => type === "SetVideoSettings"), false);
});

test("video setup is idempotent and verifies a complete change", async () => {
  const unchanged = fakeObs();
  const noOp = await applyVideoSetup(unchanged.call, { preset: "tiktok_portrait_30" });
  assert.equal(noOp.changed, false);
  assert.equal(unchanged.calls.some(([type]) => type === "SetVideoSettings"), false);

  const changed = fakeObs({ video: { ...portrait30, baseWidth: 1920, baseHeight: 1080 } });
  const result = await applyVideoSetup(changed.call, { preset: "tiktok_portrait_30" });
  assert.equal(result.changed, true);
  assert.deepEqual(result.after, portrait30);
});

test("a verification mismatch restores the previous video settings", async () => {
  const before = { ...portrait30, baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080 };
  let setCount = 0;
  let current = { ...before };
  const obsCall = async (type, args = {}) => {
    if (type === "GetVideoSettings") return { ...current };
    if (type === "GetOutputList") return { outputs: [] };
    if (type === "GetVirtualCamStatus") return { outputActive: false };
    if (type === "SetVideoSettings") {
      setCount += 1;
      current = setCount === 1 ? { ...args, outputWidth: 720 } : { ...args };
      return {};
    }
    throw new Error(`Unexpected ${type}`);
  };
  await assert.rejects(() => applyVideoSetup(obsCall, { preset: "tiktok_portrait_30" }), /restoration succeeded/);
  assert.deepEqual(current, before);
});
