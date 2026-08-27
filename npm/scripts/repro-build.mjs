#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACT_PATHS = [
  'npm/bin/nunch-skills.mjs',
  'plugins/nch-installer/runtime/nch-installer.mjs',
  'tools/upstream-sync/dist/upstream-sync.mjs',
];

function parseArguments(argv) {
  if (argv.length === 0) {
    return { repo: resolve(fileURLToPath(new URL('../../', import.meta.url))) };
  }
  if (argv.length === 2 && argv[0] === '--repo') {
    return { repo: resolve(argv[1]) };
  }
  throw new Error('usage: node npm/scripts/repro-build.mjs [--repo <path>]');
}

function runBuild(repo) {
  const result = spawnSync('pnpm', ['run', 'build'], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`reproducible build failed: ${result.stderr.trim()}`);
  }
}

async function digestArtifacts(repo) {
  const result = {};
  for (const path of ARTIFACT_PATHS) {
    const content = await readFile(join(repo, path));
    result[path] = createHash('sha256').update(content).digest('hex');
  }
  return result;
}

async function verifyReproducibleBuild(repo, build = runBuild) {
  const committedDigests = await digestArtifacts(repo);
  await build(repo);
  const firstDigests = await digestArtifacts(repo);
  await build(repo);
  const secondDigests = await digestArtifacts(repo);
  for (const path of ARTIFACT_PATHS) {
    if (firstDigests[path] !== secondDigests[path]) throw new Error(`non-deterministic bundle: ${path}`);
    if (firstDigests[path] !== committedDigests[path]) {
      throw new Error(`built bundle differs from committed release artifact: ${path}`);
    }
  }
  return firstDigests;
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

export { ARTIFACT_PATHS, verifyReproducibleBuild };

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
