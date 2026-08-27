#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageSpec = process.argv[2];
if (packageSpec === undefined || packageSpec.length === 0) {
  process.stderr.write('usage: post-publish-smoke.mjs <package-spec>\n');
  process.exitCode = 2;
} else {
  const workspace = await mkdtemp(join(tmpdir(), 'nunch-skills-published-smoke-'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const environment = { ...process.env, HOME: workspace, npm_config_cache: join(workspace, 'npm-cache') };
  try {
    for (const command of ['install', 'doctor']) {
      const result = spawnSync(
        npm,
        ['exec', '--yes', `--package=${packageSpec}`, '--', 'nunch-skills', command, '--help'],
        { cwd: workspace, encoding: 'utf8', env: environment },
      );
      if (result.stdout !== '') process.stdout.write(result.stdout);
      if (result.stderr !== '') process.stderr.write(result.stderr);
      if (result.error !== undefined) throw result.error;
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
      }
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
