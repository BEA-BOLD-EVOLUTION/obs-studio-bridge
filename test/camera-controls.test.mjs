import assert from "node:assert/strict";
import test from "node:test";
import { createCameraLayout, discoverCameras } from "../dist/camera-controls.js";

test("camera discovery combines OBS sources with Windows camera candidates", async () => {
  const obsCall = async (type, args) => {
    if (type === "GetInputList") return { inputs: [{ inputName: "Main Cam", inputKind: "dshow_input" }] };
    if (type === "GetInputSettings") return { inputSettings: { video_device_id: "obs-device-1", video_device_name: "Logitech" } };
    if (type === "GetInputActiveState") return { inputActive: true, inputShow: true };
    throw new Error(`Unexpected ${type} ${JSON.stringify(args)}`);
  };
  const runner = async () => ({
    stdout: JSON.stringify({
      supported: true,
      cameras: [
        { name: "Logitech BRIO", deviceId: "USB\\BRIO", deviceClass: "Camera", status: "OK", kind: "physical" },
        { name: "Animaze Virtual Camera", deviceId: "ROOT\\ANIMAZE", deviceClass: "Image", status: "OK", kind: "virtual" }
      ]
    })
  });
  const result = await discoverCameras(obsCall, runner);
  assert.equal(result.obsSources[0].inputName, "Main Cam");
  assert.equal(result.windowsCandidates[0].name, "Logitech BRIO");
  assert.equal(result.virtualCameraDevices[0].name, "Animaze Virtual Camera");
  assert.equal(result.identificationRequired, true);
});

test("three-camera layout creates a scene, attaches sources, and verifies transforms", async () => {
  const calls = [];
  const sceneItems = new Map();
  let sceneExists = false;
  let nextId = 1;
  const transforms = new Map();
  const inputs = ["Main Cam", "Overhead Cam", "Side Cam"];
  const obsCall = async (type, args = {}) => {
    calls.push([type, args]);
    if (type === "GetSceneList") return { scenes: sceneExists ? [{ sceneName: "Creator Studio" }] : [] };
    if (type === "CreateScene") { sceneExists = true; return {}; }
    if (type === "GetInputList") return { inputs: inputs.map(inputName => ({ inputName, inputKind: "dshow_input" })) };
    if (type === "GetSceneItemId") {
      const key = `${args.sceneName}:${args.sourceName}`;
      if (!sceneItems.has(key)) throw new Error("not found");
      return { sceneItemId: sceneItems.get(key) };
    }
    if (type === "CreateSceneItem") {
      sceneItems.set(`${args.sceneName}:${args.sourceName}`, nextId++);
      return {};
    }
    if (type === "GetVideoSettings") return { baseWidth: 1080, baseHeight: 1920 };
    if (type === "SetSceneItemTransform") { transforms.set(args.sceneItemId, args.sceneItemTransform); return {}; }
    if (type === "SetSceneItemEnabled") return {};
    if (type === "GetSceneItemTransform") return { sceneItemTransform: transforms.get(args.sceneItemId) };
    throw new Error(`Unexpected ${type}`);
  };

  const result = await createCameraLayout(obsCall, {
    sceneName: "Creator Studio",
    layout: "three_camera",
    cameraSourceNames: inputs
  });
  assert.equal(result.sceneCreated, true);
  assert.equal(result.cameras.length, 3);
  assert.equal(result.cameras[0].transform.boundsHeight, 1190.4);
  assert.equal(result.cameras[1].transform.positionY, 1190.4);
  assert.equal(calls.filter(([type]) => type === "SetSceneItemEnabled").length, 3);
});

test("layout validation rejects the wrong camera count before changing OBS", async () => {
  let called = false;
  await assert.rejects(() => createCameraLayout(async () => {
    called = true;
    return {};
  }, {
    sceneName: "Bad",
    layout: "side_by_side",
    cameraSourceNames: ["Only One"]
  }), /requires 2 camera sources/);
  assert.equal(called, false);
});

test("an unknown camera fails before creating a scene", async () => {
  const calls = [];
  await assert.rejects(() => createCameraLayout(async (type) => {
    calls.push(type);
    if (type === "GetInputList") return { inputs: [{ inputName: "Main Cam", inputKind: "dshow_input" }] };
    throw new Error(`Unexpected ${type}`);
  }, {
    sceneName: "Must Not Exist",
    layout: "fullscreen",
    cameraSourceNames: ["Missing Cam"]
  }), /was not found/);
  assert.deepEqual(calls, ["GetInputList"]);
});

test("layout creation fails when OBS does not apply the requested transform", async () => {
  const obsCall = async (type, args = {}) => {
    if (type === "GetInputList") return { inputs: [{ inputName: "Main Cam", inputKind: "dshow_input" }] };
    if (type === "GetVideoSettings") return { baseWidth: 1080, baseHeight: 1920 };
    if (type === "GetSceneList") return { scenes: [{ sceneName: "Mismatch" }] };
    if (type === "GetSceneItemId") return { sceneItemId: 1 };
    if (type === "SetSceneItemTransform" || type === "SetSceneItemEnabled") return {};
    if (type === "GetSceneItemTransform") return {
      sceneItemTransform: {
        positionX: 5,
        positionY: 0,
        boundsType: "OBS_BOUNDS_SCALE_OUTER",
        boundsWidth: 1080,
        boundsHeight: 1920
      }
    };
    throw new Error(`Unexpected ${type} ${JSON.stringify(args)}`);
  };
  await assert.rejects(() => createCameraLayout(obsCall, {
    sceneName: "Mismatch",
    layout: "fullscreen",
    cameraSourceNames: ["Main Cam"]
  }), /did not apply the verified camera placement/);
});
