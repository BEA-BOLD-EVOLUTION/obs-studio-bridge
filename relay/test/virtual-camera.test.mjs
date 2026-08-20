import assert from "node:assert/strict";
import test from "node:test";
import { dispatchVirtualCameraCommand, virtualCameraCommand } from "../src/virtual-camera.js";

test("inspection does not require confirmation", () => {
  assert.deepEqual(virtualCameraCommand("inspect"), {
    tool: "obs_get_virtual_camera_status",
    arguments: {}
  });
});

test("start and stop require explicit confirmation", () => {
  assert.throws(() => virtualCameraCommand("start"), /Explicit confirmation is required/);
  assert.throws(() => virtualCameraCommand("stop"), /Explicit confirmation is required/);
});

test("confirmed actions dispatch only the fixed allowlisted command", async () => {
  const dispatched = [];
  const dispatchCommand = async (...args) => {
    dispatched.push(args);
    return { ok: true };
  };

  await dispatchVirtualCameraCommand({
    dispatchCommand,
    accessToken: "account-token",
    deviceId: "18a36321-529f-4c0c-9e6c-c9c529d9637a",
    action: "start",
    confirmed: true
  });

  assert.deepEqual(dispatched, [[
    "account-token",
    "18a36321-529f-4c0c-9e6c-c9c529d9637a",
    { tool: "obs_start_virtual_camera", arguments: {} }
  ]]);
});

test("unknown actions cannot become arbitrary remote tools", () => {
  assert.throws(() => virtualCameraCommand("ToggleVirtualCam", true), /Unsupported virtual camera action/);
});
