#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BINARY_NAMES = [
  "nunch-skills-manager-darwin-amd64",
  "nunch-skills-manager-darwin-arm64",
  "nunch-skills-manager-linux-amd64",
  "nunch-skills-manager-linux-arm64",
  "nunch-skills-manager-windows-amd64.exe",
  "nunch-skills-manager-windows-arm64.exe"
];

function parseArguments(argv) {
  if (argv.length === 0) {
    return { repo: resolve(fileURLToPath(new URL("../../", import.meta.url))) };
  }
  if (argv.length === 2 && argv[0] === "--repo") {
    return { repo: resolve(argv[1]) };
  }
  throw new Error("usage: node npm/scripts/repro-build.mjs [--repo <path>]");
}

function runBuild(repo, output, version) {
  const result = spawnSync("sh", ["plugins/nunch-skills-manager/updater/build.sh", output], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, NUNCH_SKILLS_VERSION: version }
  });
  if (result.status !== 0) {
    throw new Error(`reproducible build failed: ${result.stderr.trim()}`);
  }
}

async function digestDirectory(directory) {
  const result = {};
  for (const name of BINARY_NAMES) {
    const content = await readFile(join(directory, name));
    result[name] = createHash("sha256").update(content).digest("hex");
  }
  return result;
}

async function verifyReproducibleBuild(repo) {
  const temporary = await mkdtemp(join(tmpdir(), "nunch-skills-repro-build-"));
  try {
    const packageManifest = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
    const first = join(temporary, "first");
    const second = join(temporary, "second");
    runBuild(repo, first, packageManifest.version);
    runBuild(repo, second, packageManifest.version);
    const firstDigests = await digestDirectory(first);
    const secondDigests = await digestDirectory(second);
    for (const name of BINARY_NAMES) {
      if (firstDigests[name] !== secondDigests[name]) {
        throw new Error(`non-deterministic binary: ${name}`);
      }
    }
    const committedDigests = await digestDirectory(
      join(repo, "plugins/nunch-skills-manager/bin")
    );
    for (const name of BINARY_NAMES) {
      if (firstDigests[name] !== committedDigests[name]) {
        throw new Error(`built binary differs from committed release artifact: ${name}`);
      }
    }
    return firstDigests;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const digests = await verifyReproducibleBuild(options.repo);
    process.stdout.write(`${JSON.stringify(digests)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`repro-build: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export { BINARY_NAMES, verifyReproducibleBuild };

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
