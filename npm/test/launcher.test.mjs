import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BINARY_PATHS,
  LauncherError,
  isPackagedInstallation,
  launch,
  selectBinary,
  verifySelectedBinary
} from "../bin/nunch-skills.mjs";

const BINARY_CONTENT = "test binary";

async function fixtureRoot(context, { manifest = false, git = false, includeBinary = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "nunch-skills-launcher-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  if (git) {
    await mkdir(join(root, ".git"));
  }
  const binaryPath = BINARY_PATHS["darwin-arm64"];
  const binary = join(root, binaryPath);
  if (includeBinary) {
    await mkdir(join(binary, ".."), { recursive: true });
    await writeFile(binary, BINARY_CONTENT);
  }
  if (manifest) {
    await writeFile(
      join(root, "release-manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        binaries: [
          {
            platform: "darwin-arm64",
            npmPath: binaryPath,
            sha256: createHash("sha256").update(BINARY_CONTENT).digest("hex")
          }
        ]
      })
    );
  }
  return root;
}

test("selectBinary maps each supported platform exactly", () => {
  assert.deepEqual(BINARY_PATHS, {
    "darwin-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-amd64",
    "darwin-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-arm64",
    "linux-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-amd64",
    "linux-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-arm64",
    "windows-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-amd64.exe",
    "windows-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-arm64.exe"
  });
  for (const [key, binaryPath] of Object.entries(BINARY_PATHS)) {
    const [platform, architecture] = key.split("-");
    assert.equal(selectBinary(platform, architecture), binaryPath);
  }
  assert.equal(selectBinary("darwin", "x64"), BINARY_PATHS["darwin-amd64"]);
  assert.equal(selectBinary("win32", "x64"), BINARY_PATHS["windows-amd64"]);
});

test("selectBinary rejects unsupported operating systems and architectures", () => {
  assert.throws(() => selectBinary("freebsd", "amd64"), LauncherError);
  assert.throws(() => selectBinary("darwin", "ia32"), LauncherError);
});

test("a source checkout may run without a release manifest", async (context) => {
  const root = await fixtureRoot(context, { git: true });
  assert.equal(await isPackagedInstallation(root), false);
  const selected = await verifySelectedBinary(root, "darwin", "arm64", { requireManifest: false });
  assert.equal(selected.verified, false);
});

test("a packaged installation requires a release manifest", async (context) => {
  const root = await fixtureRoot(context);
  assert.equal(await isPackagedInstallation(root), true);
  await assert.rejects(
    verifySelectedBinary(root, "darwin", "arm64", { requireManifest: true }),
    (error) => error.code === "NUNCH_RELEASE_MANIFEST_REQUIRED"
  );
});

test("a missing selected binary is rejected before execution", async (context) => {
  const root = await fixtureRoot(context, { git: true, includeBinary: false });
  await assert.rejects(
    verifySelectedBinary(root, "darwin", "arm64", { requireManifest: false }),
    (error) => error.code === "NUNCH_MISSING_BINARY"
  );
});

test("the selected binary must match its release-manifest digest", async (context) => {
  const root = await fixtureRoot(context, { manifest: true });
  const selected = await verifySelectedBinary(root, "darwin", "arm64", { requireManifest: true });
  assert.equal(selected.verified, true);

  await writeFile(join(root, BINARY_PATHS["darwin-arm64"]), "tampered binary");
  await assert.rejects(
    verifySelectedBinary(root, "darwin", "arm64", { requireManifest: true }),
    (error) => error.code === "NUNCH_BINARY_DIGEST_MISMATCH"
  );
});

test("launch forwards arguments, inherited stdio, environment, and exit status", async (context) => {
  const root = await fixtureRoot(context, { manifest: true });
  const environment = { NUNCH_SKILLS_TEST: "1" };
  let invocation;
  const result = await launch({
    root,
    platform: "darwin",
    architecture: "arm64",
    argv: ["doctor", "--dry-run"],
    env: environment,
    requireManifest: true,
    spawn(binary, args, options) {
      invocation = { binary, args, options };
      return { status: 7, signal: null };
    }
  });
  assert.deepEqual(invocation.args, ["doctor", "--dry-run"]);
  assert.equal(invocation.options.stdio, "inherit");
  assert.equal(invocation.options.env, environment);
  assert.equal(result.status, 7);
  assert.equal(result.signal, null);
});

test("launch preserves a child signal for the process entrypoint to forward", async (context) => {
  const root = await fixtureRoot(context, { manifest: true });
  const result = await launch({
    root,
    platform: "darwin",
    architecture: "arm64",
    requireManifest: true,
    spawn() {
      return { status: null, signal: "SIGTERM" };
    }
  });
  assert.equal(result.status, 1);
  assert.equal(result.signal, "SIGTERM");
});
