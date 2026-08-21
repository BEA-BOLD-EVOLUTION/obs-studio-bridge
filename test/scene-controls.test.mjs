import assert from "node:assert/strict";
import test from "node:test";
import { setProgramScene, setSceneSourceVisibility } from "../dist/scene-controls.js";

test("scene switching is state-aware and verifies the result", async () => {
  let current = "Starting Soon";
  const calls = [];
  const obsCall = async (type, args) => {
    calls.push([type, args]);
    if (type === "GetCurrentProgramScene") return { currentProgramSceneName: current };
    if (type === "SetCurrentProgramScene") current = args.sceneName;
    return {};
  };
  const changed = await setProgramScene(obsCall, "LIVE");
  assert.equal(changed.changed, true);
  assert.equal(changed.previousProgramSceneName, "Starting Soon");
  assert.equal((await setProgramScene(obsCall, "LIVE")).changed, false);
  assert.equal(calls.filter(([type]) => type === "SetCurrentProgramScene").length, 1);
});

test("source visibility is state-aware and verifies the result", async () => {
  let visible = false;
  const calls = [];
  const obsCall = async (type, args) => {
    calls.push([type, args]);
    if (type === "GetSceneItemId") return { sceneItemId: 9 };
    if (type === "GetSceneItemEnabled") return { sceneItemEnabled: visible };
    if (type === "SetSceneItemEnabled") visible = args.sceneItemEnabled;
    return {};
  };
  assert.equal((await setSceneSourceVisibility(obsCall, "Composite", "Feed", true)).changed, true);
  assert.equal((await setSceneSourceVisibility(obsCall, "Composite", "Feed", true)).changed, false);
  assert.equal(calls.filter(([type]) => type === "SetSceneItemEnabled").length, 1);
});

test("scene changes fail when OBS does not report the requested postcondition", async () => {
  const obsCall = async type => type === "GetCurrentProgramScene"
    ? { currentProgramSceneName: "Old" }
    : {};
  await assert.rejects(() => setProgramScene(obsCall, "New"), /did not switch/);
});
