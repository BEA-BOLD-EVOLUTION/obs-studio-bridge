import assert from "node:assert/strict";
import test from "node:test";
import { inspectProductionResources } from "../dist/production-readiness.js";

test("production inspection reports required scene and source state without writes", async () => {
  const calls = [];
  const responses = {
    GetVersion: { obsVersion: "32.0.0", obsWebSocketVersion: "5.6.0" },
    GetSceneList: { currentProgramSceneName: "Composite", scenes: [{ sceneName: "Composite" }] },
    GetSceneItemList: { sceneItems: [{ sourceName: "Background Feed", sceneItemEnabled: true }] },
    GetVideoSettings: { outputWidth: 1080, outputHeight: 1920, fpsNumerator: 30, fpsDenominator: 1 },
    GetVirtualCamStatus: { outputActive: false }
  };
  const obsCall = async (type, args) => { calls.push([type, args]); return responses[type]; };

  const inspection = await inspectProductionResources(obsCall, {
    sceneName: "Composite",
    sourceNames: ["Background Feed", "Camera"]
  });

  assert.equal(inspection.scene.exists, true);
  assert.deepEqual(inspection.sources, [
    { name: "Background Feed", exists: true, enabled: true },
    { name: "Camera", exists: false, enabled: false }
  ]);
  assert.equal(calls.some(([type]) => type.startsWith("Set") || type.startsWith("Start") || type.startsWith("Stop")), false);
});

test("missing scene is reported instead of changing OBS", async () => {
  const obsCall = async type => ({
    GetVersion: {},
    GetSceneList: { currentProgramSceneName: "Live", scenes: [] },
    GetSceneItemList: { sceneItems: [] },
    GetVideoSettings: {},
    GetVirtualCamStatus: { outputActive: false }
  })[type];
  const inspection = await inspectProductionResources(obsCall, { sceneName: "Missing" });
  assert.equal(inspection.scene.exists, false);
});
