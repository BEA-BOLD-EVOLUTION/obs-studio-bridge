import assert from "node:assert/strict";
import test from "node:test";
import { inspectVirtualCamera, setVirtualCameraActive } from "../dist/output-controls.js";

function fakeObs(initialActive, options = {}) {
  let active = initialActive;
  let pendingState;
  let remainingStatusChecks = 0;
  const calls = [];
  const call = async (requestType) => {
    calls.push(requestType);
    if (requestType === "GetVirtualCamStatus") {
      if (pendingState !== undefined && remainingStatusChecks === 0) {
        active = pendingState;
        pendingState = undefined;
      } else if (pendingState !== undefined) {
        remainingStatusChecks -= 1;
      }
      return { outputActive: active };
    }
    if (requestType === "StartVirtualCam") {
      if (!options.ignoreStart && options.startDelayChecks) {
        pendingState = true;
        remainingStatusChecks = options.startDelayChecks;
      } else if (!options.ignoreStart) active = true;
      return {};
    }
    if (requestType === "StopVirtualCam") {
      if (!options.ignoreStop) active = false;
      return {};
    }
    throw new Error(`Unexpected OBS request ${requestType}`);
  };
  return { call, calls };
}

test("inspectVirtualCamera reports the current OBS state", async () => {
  const obs = fakeObs(true);
  const result = await inspectVirtualCamera(obs.call);
  assert.equal(result.available, true);
  assert.equal(result.outputActive, true);
  assert.deepEqual(obs.calls, ["GetVirtualCamStatus"]);
});

test("start is idempotent when Virtual Camera is already active", async () => {
  const obs = fakeObs(true);
  const result = await setVirtualCameraActive(obs.call, true);
  assert.equal(result.changed, false);
  assert.deepEqual(obs.calls, ["GetVirtualCamStatus"]);
});

test("start uses an explicit start request and verifies the resulting state", async () => {
  const obs = fakeObs(false);
  const result = await setVirtualCameraActive(obs.call, true);
  assert.equal(result.changed, true);
  assert.equal(result.outputActive, true);
  assert.deepEqual(obs.calls, ["GetVirtualCamStatus", "StartVirtualCam", "GetVirtualCamStatus"]);
});

test("start tolerates OBS applying the state asynchronously", async () => {
  const obs = fakeObs(false, { startDelayChecks: 2 });
  const result = await setVirtualCameraActive(obs.call, true, {
    verificationAttempts: 4,
    verificationDelayMs: 0
  });
  assert.equal(result.outputActive, true);
  assert.deepEqual(obs.calls, [
    "GetVirtualCamStatus",
    "StartVirtualCam",
    "GetVirtualCamStatus",
    "GetVirtualCamStatus",
    "GetVirtualCamStatus"
  ]);
});

test("stop is idempotent when Virtual Camera is already inactive", async () => {
  const obs = fakeObs(false);
  const result = await setVirtualCameraActive(obs.call, false);
  assert.equal(result.changed, false);
  assert.deepEqual(obs.calls, ["GetVirtualCamStatus"]);
});

test("stop uses an explicit stop request and verifies the resulting state", async () => {
  const obs = fakeObs(true);
  const result = await setVirtualCameraActive(obs.call, false);
  assert.equal(result.changed, true);
  assert.equal(result.outputActive, false);
  assert.deepEqual(obs.calls, ["GetVirtualCamStatus", "StopVirtualCam", "GetVirtualCamStatus"]);
});

test("a mismatched postcondition is reported as a failure", async () => {
  const obs = fakeObs(false, { ignoreStart: true });
  await assert.rejects(
    () => setVirtualCameraActive(obs.call, true, { verificationAttempts: 2, verificationDelayMs: 0 }),
    /did not report it active afterward/
  );
});
