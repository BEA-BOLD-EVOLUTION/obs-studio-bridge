import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Windows release payload uses a copy-safe dependency layout", () => {
  const workspace = fs.readFileSync("pnpm-workspace.yaml", "utf8");
  const installerWorkflow = fs.readFileSync(".github/workflows/build-creator-release.yml", "utf8");
  const msixWorkflow = fs.readFileSync(".github/workflows/msix-feasibility.yml", "utf8");

  assert.match(workspace, /nodeLinker:\s*hoisted/);
  assert.match(installerWorkflow, /streamableHttp\.js/);
  assert.match(installerWorkflow, /packaged MCP runtime dependency graph is incomplete/);
  assert.match(msixWorkflow, /streamableHttp\.js/);
  assert.match(msixWorkflow, /packaged MCP runtime dependency graph is incomplete/);
});
