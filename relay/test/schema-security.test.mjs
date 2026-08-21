import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dual-PC preset migration enforces ownership and authenticated-only Data API access", async () => {
  const sql = await readFile(new URL("../migrations/20260820_phase_2_dual_pc_presets.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /foreign key \(owner_user_id, background_device_id\)/i);
  assert.match(sql, /foreign key \(owner_user_id, compositor_device_id\)/i);
  assert.match(sql, /revoke all on table public\.obs_dual_pc_presets from anon/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.obs_dual_pc_presets to authenticated/i);
  assert.doesNotMatch(sql, /grant .*obs_dual_pc_presets to anon/i);
});

test("pairing RPC grants are limited to the role that needs each operation", async () => {
  const sql = await readFile(new URL("../migrations/20260820_phase_2_advisor_hardening.sql", import.meta.url), "utf8");
  assert.match(sql, /register_obs_device[\s\S]*from authenticated/i);
  assert.match(sql, /claim_obs_device\(uuid, text\) from anon/i);
  assert.match(sql, /claim_obs_device_by_code\(text\) from anon/i);
});
