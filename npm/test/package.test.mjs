import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const REPOSITORY_ROOT = new URL("../../", import.meta.url);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("npm pack --dry-run publishes only the declared package surface", async (context) => {
  const cache = await mkdtemp(join(tmpdir(), "nunch-skills-pack-cache-"));
  context.after(() => rm(cache, { recursive: true, force: true }));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["pack", "--dry-run", "--json", "--cache", cache], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const [pack] = JSON.parse(result.stdout);
  const paths = pack.files.map((entry) => entry.path).sort();
  const expected = [
    "LICENSE",
    "README.md",
    "npm/bin/nunch-skills.mjs",
    "package.json",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-amd64",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-arm64",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-amd64",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-arm64",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-amd64.exe",
    "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-arm64.exe"
  ];
  if (await exists(new URL("../../release-manifest.json", import.meta.url))) {
    expected.push("release-manifest.json");
  }
  assert.deepEqual(paths, expected.sort());
});
