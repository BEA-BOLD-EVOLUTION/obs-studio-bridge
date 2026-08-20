import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInspection,
  inspectionCommand,
  presetRecord,
  readinessSummary,
  toolPayload
} from "../src/dual-pc.js";

test("a preset cannot target the same computer for both roles", () => {
  assert.throws(() => presetRecord({ backgroundDeviceId: "same", compositorDeviceId: "same" }), /different computers/);
});

test("inspection command is fixed, read-only, and de-duplicates source names", () => {
  assert.deepEqual(inspectionCommand("Composite", ["Feed", "Feed", "Camera"]), {
    tool: "obs_inspect_production_resources",
    arguments: { sceneName: "Composite", sourceNames: ["Feed", "Camera"] }
  });
});

test("tool payload reads only the local MCP text result", () => {
  const payload = { scene: { exists: true } };
  const value = toolPayload({ response: { result: { content: [{ type: "text", text: JSON.stringify(payload) }] } } });
  assert.deepEqual(value, payload);
  assert.throws(() => toolPayload({ response: { result: {} } }), /unreadable/);
});

test("readiness finds missing and disabled compositor sources", () => {
  const result = evaluateInspection({
    role: "camera_compositor",
    device: { id: "camera" },
    expected: { sceneName: "Composite", width: 1080, height: 1920, fps: 30 },
    requiredSources: ["Feed", "Camera"],
    inspection: {
      scene: { exists: true },
      sources: [{ name: "Feed", exists: true, enabled: false }],
      video: { outputWidth: 1080, outputHeight: 1920, fpsNumerator: 30, fpsDenominator: 1 },
      virtualCamera: { outputActive: false }
    }
  });
  assert.equal(result.ready, false);
  assert.match(result.issues.join(" "), /disabled/);
  assert.match(result.issues.join(" "), /Camera.*not found/);
});

test("readiness reports resolution, frame-rate, and Virtual Camera mismatches", () => {
  const result = evaluateInspection({
    role: "camera_compositor",
    device: { id: "camera" },
    expected: { sceneName: "Composite", width: 1080, height: 1920, fps: 30 },
    requiredSources: [],
    inspection: {
      scene: { exists: true },
      sources: [],
      video: { outputWidth: 1920, outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 },
      virtualCamera: { unavailable: "not installed" }
    }
  });
  assert.equal(result.ready, false);
  assert.match(result.issues.join(" "), /resolution/);
  assert.match(result.issues.join(" "), /Frame rate/);
  assert.match(result.issues.join(" "), /Virtual Camera is unavailable/);
});

test("TikTok preview is distinct from OBS readiness", () => {
  const background = { ready: true, inspection: {} };
  const compositor = { ready: true, inspection: { virtualCamera: { outputActive: false } } };
  const before = readinessSummary(background, compositor, true);
  assert.equal(before.obsReady, true);
  assert.equal(before.readyForVirtualCameraStart, true);
  assert.equal(before.readyForTikTokPreview, false);

  compositor.inspection.virtualCamera.outputActive = true;
  assert.equal(readinessSummary(background, compositor, true).readyForTikTokPreview, true);
  assert.equal(readinessSummary(background, compositor, false).readyForTikTokPreview, false);
});
