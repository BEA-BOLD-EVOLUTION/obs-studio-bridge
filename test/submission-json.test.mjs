import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ChatGPT submission metadata includes the embedded creator dashboard tools", async () => {
  const raw = await readFile(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8");
  const submission = JSON.parse(raw);

  assert.equal(submission.tools.obs_get_dashboard_state.annotations.readOnlyHint, true);
  assert.equal(submission.tools.obs_open_dashboard.annotations.readOnlyHint, true);
  assert.match(submission.app_info.description, /creator/i);
});

test("ChatGPT submission metadata includes the Phase 2 virtual camera tools", async () => {
  const raw = await readFile(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8");
  const submission = JSON.parse(raw);

  assert.ok(submission.tools.obs_get_virtual_camera_status);
  assert.ok(submission.tools.obs_start_virtual_camera);
  assert.ok(submission.tools.obs_stop_virtual_camera);
  assert.equal(submission.tools.obs_get_virtual_camera_status.annotations.readOnlyHint, true);
  assert.equal(submission.tools.obs_start_virtual_camera.annotations.readOnlyHint, false);
  assert.equal(submission.tools.obs_stop_virtual_camera.annotations.readOnlyHint, false);
});

test("ChatGPT submission metadata includes dual-PC setup and readiness tools", async () => {
  const raw = await readFile(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8");
  const submission = JSON.parse(raw);

  assert.equal(submission.tools.obs_update_computer.annotations.readOnlyHint, false);
  assert.equal(submission.tools.obs_save_dual_pc_preset.annotations.readOnlyHint, false);
  assert.equal(submission.tools.obs_list_dual_pc_presets.annotations.readOnlyHint, true);
  assert.equal(submission.tools.obs_inspect_dual_pc_readiness.annotations.readOnlyHint, true);
});

test("ChatGPT submission metadata includes confirmed coordination and session tools", async () => {
  const raw = await readFile(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8");
  const submission = JSON.parse(raw);

  assert.equal(submission.tools.obs_start_dual_pc_production.annotations.readOnlyHint, false);
  assert.equal(submission.tools.obs_stop_dual_pc_production.annotations.readOnlyHint, false);
  assert.equal(submission.tools.obs_list_dual_pc_sessions.annotations.readOnlyHint, true);
  assert.equal(submission.tools.obs_inspect_dual_pc_session_health.annotations.readOnlyHint, true);
  assert.equal(submission.tools.obs_update_dual_pc_production.annotations.readOnlyHint, false);
  assert.match(submission.tools.obs_start_dual_pc_production.justifications.open_world_justification, /does not start a TikTok LIVE/i);
  assert.match(submission.tools.obs_inspect_dual_pc_session_health.justifications.destructive_justification, /read-only status and performance/i);
  assert.match(submission.tools.obs_update_dual_pc_production.justifications.destructive_justification, /attempts immediate compensation/i);
});
