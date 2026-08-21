import assert from "node:assert/strict";
import test from "node:test";
import { isRemoteToolAllowed } from "../dist/remote-tools.js";

test("the three virtual camera tools are remotely allowlisted", () => {
  assert.equal(isRemoteToolAllowed("obs_get_virtual_camera_status"), true);
  assert.equal(isRemoteToolAllowed("obs_start_virtual_camera"), true);
  assert.equal(isRemoteToolAllowed("obs_stop_virtual_camera"), true);
});

test("the production readiness inspection is remotely allowlisted", () => {
  assert.equal(isRemoteToolAllowed("obs_inspect_production_resources"), true);
  assert.equal(isRemoteToolAllowed("obs_get_performance_stats"), true);
  assert.equal(isRemoteToolAllowed("obs_set_source_visibility"), true);
});

test("focused audio inspection and bounded audio controls are remotely allowlisted", () => {
  assert.equal(isRemoteToolAllowed("obs_inspect_audio_input"), true);
  assert.equal(isRemoteToolAllowed("obs_set_input_mute"), true);
  assert.equal(isRemoteToolAllowed("obs_set_input_volume"), true);
});

test("arbitrary OBS tools remain blocked", () => {
  assert.equal(isRemoteToolAllowed("obs_call"), false);
  assert.equal(isRemoteToolAllowed("DeleteScene"), false);
  assert.equal(isRemoteToolAllowed("ToggleVirtualCam"), false);
});
