import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cache = await mkdtemp(join(tmpdir(), 'nunch-skills-pack-cache-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.toLowerCase().startsWith('npm_config_')) delete environment[key];
}

try {
  const result = spawnSync(npm, ['pack', '--dry-run', '--json', '--cache', cache], {
    encoding: 'utf8',
    env: environment,
  });
  if (result.stdout !== '') {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== '') {
    process.stderr.write(result.stderr);
  }
  if (result.error !== undefined) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  await rm(cache, { recursive: true, force: true });
}
