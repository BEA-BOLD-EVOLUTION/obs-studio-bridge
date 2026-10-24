import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectTikTokLiveStudio,
  launchTikTokLiveStudio,
  listWindowsCameraCandidates
} from "../dist/desktop-integration.js";

test("TikTok LIVE Studio inspection parses bounded Windows metadata", async () => {
  const calls = [];
  const runner = async (file, args) => {
    calls.push({ file, args });
    return {
      stdout: JSON.stringify({
        supported: true,
        installed: true,
        running: false,
        applications: [{ name: "TikTok LIVE Studio", appId: "TikTok.LiveStudio" }],
        processes: []
      })
    };
  };
  const result = await inspectTikTokLiveStudio(runner);
  assert.equal(result.installed, true);
  assert.equal(result.running, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("-NonInteractive"));
});

test("TikTok LIVE Studio launch requires creator confirmation", async () => {
  let called = false;
  const runner = async () => {
    called = true;
    return { stdout: "{}" };
  };
  await assert.rejects(() => launchTikTokLiveStudio(false, runner), /Explicit creator confirmation/);
  assert.equal(called, false);
});

test("confirmed TikTok LIVE Studio launch reports the verified result", async () => {
  const result = await launchTikTokLiveStudio(true, async () => ({
    stdout: JSON.stringify({ ok: true, changed: true, running: true, application: "TikTok LIVE Studio" })
  }));
  assert.equal(result.running, true);
  assert.equal(result.changed, true);
});

test("Windows camera candidates contain labels and stable device identifiers", async () => {
  const result = await listWindowsCameraCandidates(async () => ({
    stdout: JSON.stringify({
      supported: true,
      cameras: [{ name: "USB Camera", deviceId: "USB\\VID_1234", deviceClass: "Camera", status: "OK", kind: "physical" }]
    })
  }));
  assert.equal(result.cameras[0].name, "USB Camera");
  assert.equal(result.cameras[0].deviceId, "USB\\VID_1234");
  assert.equal(result.cameras[0].kind, "physical");
});
