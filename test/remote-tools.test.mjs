import assert from "node:assert/strict";
import test from "node:test";
import { isRemoteToolAllowed } from "../dist/remote-tools.js";

test("the three virtual camera tools are remotely allowlisted", () => {
  assert.equal(isRemoteToolAllowed("obs_get_virtual_camera_status"), true);
  assert.equal(isRemoteToolAllowed("obs_start_virtual_camera"), true);
  assert.equal(isRemoteToolAllowed("obs_stop_virtual_camera"), true);
});

test("arbitrary OBS tools remain blocked", () => {
  assert.equal(isRemoteToolAllowed("obs_call"), false);
  assert.equal(isRemoteToolAllowed("DeleteScene"), false);
  assert.equal(isRemoteToolAllowed("ToggleVirtualCam"), false);
});
