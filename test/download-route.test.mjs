import assert from "node:assert/strict";
import test from "node:test";
import {
  installerUnavailableHtml,
  signedInstallerAvailable
} from "../oauth-ui/download.js";

test("the download target is enabled only when the signed installer exists", async () => {
  const available = await signedInstallerAvailable("https://example.test/installer.exe", async () => ({ ok: true }));
  const missing = await signedInstallerAvailable("https://example.test/installer.exe", async () => ({ ok: false }));

  assert.equal(available, true);
  assert.equal(missing, false);
});

test("a download lookup failure is handled as unavailable", async () => {
  const available = await signedInstallerAvailable("https://example.test/installer.exe", async () => {
    throw new Error("network unavailable");
  });

  assert.equal(available, false);
});

test("the unavailable page does not direct creators to the obsolete source ZIP", () => {
  const html = installerUnavailableHtml();

  assert.match(html, /temporarily unavailable/i);
  assert.match(html, /no approved signed installer/i);
  assert.match(html, /older source ZIP is not the Creator Assistant desktop helper/i);
  assert.doesNotMatch(html, /v1\.0\.0/i);
  assert.doesNotMatch(html, /obs-studio-bridge\.zip/i);
});
