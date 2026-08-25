import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = fs.readFileSync("installer/windows/msix/AppxManifest.template.xml", "utf8");
const builder = fs.readFileSync("installer/windows/msix/build-msix.ps1", "utf8");
const launcher = fs.readFileSync("installer/windows/launcher/main.cpp", "utf8");
const bootstrap = fs.readFileSync("src/bootstrap.ts", "utf8");

test("MSIX declares only the required full-trust desktop capability", () => {
  assert.match(manifest, /rescap:Capability Name="runFullTrust"/);
  assert.doesNotMatch(manifest, /allowElevation/);
  assert.match(manifest, /uap10:TrustLevel="mediumIL"/);
});

test("MSIX startup remains an explicit user-controlled choice", () => {
  assert.match(manifest, /Category="windows\.startupTask"/);
  assert.match(manifest, /Enabled="false"/);
  assert.match(manifest, /Executable="app\\OBS-Creator-Assistant-Background\.exe"/);
});

test("MSIX build keeps the OBS VFS experiment explicit", () => {
  assert.match(builder, /VFS\\Common AppData\\obs-studio\\plugins/);
  assert.doesNotMatch(builder, /Trusted Root Certification Authorities/);
  assert.match(builder, /DevelopmentSign/);
  assert.match(builder, /PfxPath/);
  assert.doesNotMatch(builder, /Copy-Item[^\n]*PfxPath/i);
});

test("packaged companion separates immutable assets from per-user state", () => {
  assert.match(launcher, /GetCurrentPackageFamilyName/);
  assert.match(launcher, /LocalState/);
  assert.match(launcher, /OBS_CREATOR_ASSISTANT_PACKAGE_ROOT/);
  assert.match(launcher, /OBS_CREATOR_ASSISTANT_DATA_ROOT/);
  assert.match(launcher, /OBS-Creator-Assistant-Background\.exe/);
  assert.match(bootstrap, /OBS_CREATOR_ASSISTANT_PACKAGE_ROOT/);
});
