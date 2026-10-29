import assert from "node:assert/strict";
import test from "node:test";
import {
  createScene,
  duplicateScene,
  removeScene,
  renameScene,
  setProgramScene,
  setSceneSourceVisibility
} from "../dist/scene-controls.js";

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

test("scene creation is idempotent and verifies the new scene", async () => {
  const scenes = [{ sceneName: "LIVE", sceneUuid: "live-1" }];
  const calls = [];
  const obsCall = async (type, args) => {
    calls.push([type, args]);
    if (type === "GetSceneList") return { scenes, currentProgramSceneName: "LIVE" };
    if (type === "CreateScene") {
      scenes.push({ sceneName: args.sceneName, sceneUuid: "new-2" });
      return { sceneUuid: "new-2" };
    }
    return {};
  };

  assert.equal((await createScene(obsCall, " Break ")).changed, true);
  assert.equal((await createScene(obsCall, "Break")).changed, false);
  assert.equal(calls.filter(([type]) => type === "CreateScene").length, 1);
});

test("scene rename validates conflicts and verifies the result", async () => {
  const scenes = [{ sceneName: "Break" }, { sceneName: "LIVE" }];
  const obsCall = async (type, args) => {
    if (type === "GetSceneList") return { scenes, currentProgramSceneName: "LIVE" };
    if (type === "SetSceneName") scenes.find(scene => scene.sceneName === args.sceneName).sceneName = args.newSceneName;
    return {};
  };

  const renamed = await renameScene(obsCall, "Break", "BRB");
  assert.equal(renamed.changed, true);
  await assert.rejects(() => renameScene(obsCall, "BRB", "LIVE"), /already exists/);
  await assert.rejects(() => renameScene(obsCall, "Missing", "New"), /does not exist/);
});

test("scene duplication copies items in layer order and preserves visibility", async () => {
  const scenes = [{ sceneName: "LIVE" }];
  const sourceItems = [
    { sceneItemId: 20, sceneItemIndex: 1, sceneItemEnabled: false, sourceName: "Overlay" },
    { sceneItemId: 10, sceneItemIndex: 0, sceneItemEnabled: true, sourceName: "Camera" }
  ];
  const destinationItems = [];
  const duplicatedIds = [];
  const obsCall = async (type, args) => {
    if (type === "GetSceneList") return { scenes, currentProgramSceneName: "LIVE" };
    if (type === "CreateScene") {
      scenes.push({ sceneName: args.sceneName });
      return { sceneUuid: "copy-1" };
    }
    if (type === "GetSceneItemList") {
      return { sceneItems: args.sceneName === "LIVE" ? sourceItems : destinationItems };
    }
    if (type === "DuplicateSceneItem") {
      duplicatedIds.push(args.sceneItemId);
      const sceneItemId = 100 + destinationItems.length;
      const sourceItem = sourceItems.find(item => item.sceneItemId === args.sceneItemId);
      destinationItems.push({
        sceneItemId,
        sceneItemIndex: destinationItems.length,
        sceneItemEnabled: true,
        sourceName: sourceItem.sourceName,
        sceneItemTransform: sourceItem.sceneItemTransform
      });
      return { sceneItemId };
    }
    if (type === "SetSceneItemEnabled") {
      destinationItems.find(item => item.sceneItemId === args.sceneItemId).sceneItemEnabled = args.sceneItemEnabled;
    }
    return {};
  };

  const duplicated = await duplicateScene(obsCall, "LIVE", "LIVE Copy");
  assert.equal(duplicated.duplicatedItemCount, 2);
  assert.deepEqual(duplicatedIds, [10, 20]);
  assert.deepEqual(destinationItems.map(item => item.sceneItemEnabled), [true, false]);
});

test("failed scene duplication removes the incomplete destination", async () => {
  const scenes = [{ sceneName: "LIVE" }];
  const calls = [];
  const obsCall = async (type, args) => {
    calls.push([type, args]);
    if (type === "GetSceneList") return { scenes, currentProgramSceneName: "LIVE" };
    if (type === "GetSceneItemList") return { sceneItems: [{ sceneItemId: 1, sceneItemIndex: 0 }] };
    if (type === "CreateScene") scenes.push({ sceneName: args.sceneName });
    if (type === "DuplicateSceneItem") throw new Error("duplicate failed");
    if (type === "RemoveScene") scenes.splice(scenes.findIndex(scene => scene.sceneName === args.sceneName), 1);
    return {};
  };

  await assert.rejects(() => duplicateScene(obsCall, "LIVE", "Broken Copy"), /duplicate failed/);
  assert.ok(calls.some(([type, args]) => type === "RemoveScene" && args.sceneName === "Broken Copy"));
});

test("scene removal requires exact confirmation and refuses unsafe targets", async () => {
  const scenes = [{ sceneName: "LIVE" }, { sceneName: "Preview" }, { sceneName: "Old" }];
  const obsCall = async (type, args) => {
    if (type === "GetSceneList") {
      return { scenes, currentProgramSceneName: "LIVE", currentPreviewSceneName: "Preview" };
    }
    if (type === "RemoveScene") scenes.splice(scenes.findIndex(scene => scene.sceneName === args.sceneName), 1);
    return {};
  };

  await assert.rejects(() => removeScene(obsCall, "Old", "old"), /exactly match/);
  await assert.rejects(() => removeScene(obsCall, "LIVE", "LIVE"), /current program/);
  await assert.rejects(() => removeScene(obsCall, "Preview", "Preview"), /current preview/);
  assert.equal((await removeScene(obsCall, "Old", "Old")).removedSceneName, "Old");
});

test("scene removal never removes the last remaining scene", async () => {
  const obsCall = async type => type === "GetSceneList"
    ? { scenes: [{ sceneName: "Only" }], currentProgramSceneName: null }
    : {};
  await assert.rejects(() => removeScene(obsCall, "Only", "Only"), /at least one scene/);
});
