#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const MANIFEST_NAME = "release-manifest.json";
const BINARY_PATHS = Object.freeze({
  "darwin-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-amd64",
  "darwin-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-darwin-arm64",
  "linux-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-amd64",
  "linux-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-linux-arm64",
  "windows-amd64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-amd64.exe",
  "windows-arm64": "plugins/nunch-skills-manager/bin/nunch-skills-manager-windows-arm64.exe"
});

class LauncherError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function packageRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function platformKey(platform, architecture) {
  const normalizedPlatform = platform === "win32" ? "windows" : platform;
  if (normalizedPlatform !== "darwin" && normalizedPlatform !== "linux" && normalizedPlatform !== "windows") {
    throw new LauncherError("NUNCH_UNSUPPORTED_PLATFORM", `unsupported operating system: ${platform}`);
  }
  const normalizedArchitecture = architecture === "x64" ? "amd64" : architecture;
  if (normalizedArchitecture !== "amd64" && normalizedArchitecture !== "arm64") {
    throw new LauncherError("NUNCH_UNSUPPORTED_ARCHITECTURE", `unsupported architecture: ${architecture}`);
  }
  return `${normalizedPlatform}-${normalizedArchitecture}`;
}

function selectBinary(platform, architecture) {
  const key = platformKey(platform, architecture);
  const binaryPath = BINARY_PATHS[key];
  if (binaryPath === undefined) {
    throw new LauncherError("NUNCH_UNSUPPORTED_PLATFORM", `unsupported platform: ${key}`);
  }
  return binaryPath;
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new LauncherError("NUNCH_INVALID_RELEASE_MANIFEST", "release manifest must be an object");
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.binaries)) {
    throw new LauncherError("NUNCH_INVALID_RELEASE_MANIFEST", "release manifest has an unsupported schema");
  }
  return manifest.binaries;
}

function findManifestBinary(binaries, key, binaryPath) {
  const matches = binaries.filter((entry) => entry?.platform === key);
  if (matches.length !== 1) {
    throw new LauncherError("NUNCH_INVALID_RELEASE_MANIFEST", `release manifest must declare one binary for ${key}`);
  }
  const [entry] = matches;
  if (entry.npmPath !== binaryPath || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
    throw new LauncherError("NUNCH_INVALID_RELEASE_MANIFEST", `release manifest has an invalid binary declaration for ${key}`);
  }
  return entry;
}

async function verifySelectedBinary(root, platform, architecture, options = {}) {
  const binaryPath = selectBinary(platform, architecture);
  const binary = resolve(root, binaryPath);
  const normalizedPath = relative(root, binary);
  if (normalizedPath === "" || normalizedPath.startsWith("..")) {
    throw new LauncherError("NUNCH_INVALID_BINARY_PATH", "selected binary escapes package root");
  }
  if (!(await pathExists(binary))) {
    throw new LauncherError("NUNCH_MISSING_BINARY", `bundled binary is missing: ${binaryPath}`);
  }

  const manifestPath = resolve(root, MANIFEST_NAME);
  if (!(await pathExists(manifestPath))) {
    if (options.requireManifest === true) {
      throw new LauncherError("NUNCH_RELEASE_MANIFEST_REQUIRED", "release manifest is required for a packaged installation");
    }
    return { binary, binaryPath, verified: false };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new LauncherError("NUNCH_INVALID_RELEASE_MANIFEST", `release manifest cannot be read: ${error.message}`);
  }
  const entry = findManifestBinary(validateManifest(manifest), platformKey(platform, architecture), binaryPath);
  const digest = await hashFile(binary);
  if (digest !== entry.sha256) {
    throw new LauncherError("NUNCH_BINARY_DIGEST_MISMATCH", `bundled binary digest does not match release manifest: ${binaryPath}`);
  }
  return { binary, binaryPath, verified: true };
}

async function isPackagedInstallation(root) {
  return !(await pathExists(resolve(root, ".git")));
}

async function launch(options = {}) {
  const root = options.root ?? packageRoot();
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  const argv = options.argv ?? process.argv.slice(2);
  const requireManifest = options.requireManifest ?? (await isPackagedInstallation(root));
  const selected = await verifySelectedBinary(root, platform, architecture, { requireManifest });
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(selected.binary, argv, {
    env: options.env ?? process.env,
    stdio: "inherit"
  });
  if (result.error !== undefined) {
    throw new LauncherError("NUNCH_BINARY_EXECUTION_FAILED", `run bundled binary: ${result.error.message}`);
  }
  return {
    signal: result.signal ?? null,
    status: result.status ?? 1
  };
}

async function main() {
  try {
    const result = await launch();
    if (result.signal !== null) {
      process.kill(process.pid, result.signal);
      return 1;
    }
    return result.status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`nunch-skills: ${message}\n`);
    return 1;
  }
}

export {
  BINARY_PATHS,
  LauncherError,
  isPackagedInstallation,
  launch,
  packageRoot,
  platformKey,
  selectBinary,
  verifySelectedBinary
};

async function isMainModule() {
  if (process.argv[1] === undefined) {
    return false;
  }
  return (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)));
}

if (await isMainModule()) {
  process.exitCode = await main();
}
