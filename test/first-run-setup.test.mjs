import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { clipTargetsForMode } from "../dist/clipper-server.js";
import { ensureObsWebSocketConfiguration } from "../dist/obs-config.js";
import { onboardingHtml } from "../dist/relay-client.js";
import { readCreatorSetup, validateCreatorSetup, writeCreatorSetup } from "../dist/setup-config.js";

test("first run defaults to Program View without requiring viewer hardware", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creator-setup-"));
  try {
    const config = readCreatorSetup(root);
    assert.equal(config.setupComplete, false);
    assert.equal(config.clipMode, "program");
    assert.equal(config.viewerCaptureMethod, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("viewer setup requires a supported capture choice and local OBS endpoint", () => {
  assert.throws(() => validateCreatorSetup({ clipMode: "viewer" }), /Choose how/);
  assert.throws(() => validateCreatorSetup({
    clipMode: "viewer",
    viewerCaptureMethod: "airplay",
    viewerObsUrl: "wss://example.com:4456"
  }), /local ws/);
});

test("Both keeps production and viewer clip paths separate", () => {
  assert.deepEqual(clipTargetsForMode("both"), ["program", "viewer"]);
  assert.deepEqual(clipTargetsForMode("program"), ["program"]);
  assert.deepEqual(clipTargetsForMode("viewer"), ["viewer"]);
});

test("saved setup contains preferences but no local bridge token", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creator-setup-"));
  try {
    const saved = writeCreatorSetup({
      clipMode: "both",
      viewerCaptureMethod: "hardware_capture",
      viewerObsUrl: "ws://127.0.0.1:4456",
      viewerSourceName: "Viewer Phone"
    }, root);
    assert.equal(saved.setupComplete, true);
    const raw = fs.readFileSync(path.join(root, "config", "creator-settings.json"), "utf8");
    assert.equal(raw.includes("BRIDGE_AUTH_TOKEN"), false);
    assert.equal(raw.includes("bridge-token"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("first run enables OBS WebSocket and creates a distinct password atomically", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-config-"));
  try {
    const configPath = path.join(root, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      server_enabled: false,
      server_port: 4460,
      auth_required: true,
      server_password: "",
      untouched: "preserved"
    }));
    const result = ensureObsWebSocketConfiguration(configPath);
    assert.equal(result.url, "ws://127.0.0.1:4460");
    assert.equal(result.changed, true);
    assert.ok(result.password.length >= 32);
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(saved.server_enabled, true);
    assert.equal(saved.server_password, result.password);
    assert.equal(saved.untouched, "preserved");
    assert.equal(fs.readdirSync(root).some(name => name.endsWith(".tmp")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an existing OBS WebSocket password is preserved", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "obs-config-"));
  try {
    const configPath = path.join(root, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      server_enabled: true,
      server_port: 4455,
      auth_required: true,
      server_password: "creator-existing-password"
    }));
    const result = ensureObsWebSocketConfiguration(configPath);
    assert.equal(result.changed, false);
    assert.equal(result.password, "creator-existing-password");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("creator wizard exposes friendly choices without developer setup terms", () => {
  const html = onboardingHtml();
  assert.match(html, /Program View/);
  assert.match(html, /Viewer View/);
  assert.match(html, />Both</);
  assert.match(html, /AirPlay/);
  assert.match(html, /Software mirroring/);
  assert.match(html, /Hardware capture/);
  assert.match(html, /one-time approval/i);
  for (const forbidden of ["PowerShell", ".env", "YAML", "API key", "MCP"]) {
    assert.equal(html.includes(forbidden), false, `wizard must not expose ${forbidden}`);
  }
});
