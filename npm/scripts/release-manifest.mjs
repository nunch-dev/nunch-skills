#!/usr/bin/env node

import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateReleaseManifest, ReleaseManifestError } from './release-manifest-core.mjs';

function usage() {
  return 'usage: node npm/scripts/release-manifest.mjs --repo <path> --staging <path> --commit <full-sha> --tag <vX> [--dry-run]';
}

function parseArguments(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new ReleaseManifestError(`unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (key !== 'repo' && key !== 'staging' && key !== 'commit' && key !== 'tag') {
      throw new ReleaseManifestError(`unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ReleaseManifestError(`${argument} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  if (!options.help) {
    for (const key of ['repo', 'staging', 'commit', 'tag']) {
      if (options[key] === undefined) {
        throw new ReleaseManifestError(`--${key} is required`);
      }
    }
  }
  return options;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const result = await generateReleaseManifest(options);
    process.stdout.write(options.dryRun ? result.bytes : `${result.output}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`release-manifest: ${message}\n${usage()}\n`);
    return 1;
  }
}

export { parseArguments };

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
