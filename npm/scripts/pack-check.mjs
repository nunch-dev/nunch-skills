import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = await mkdtemp(join(tmpdir(), 'nunch-skills-pack-cache-'));
const packageRoot = await mkdtemp(join(tmpdir(), 'nunch-skills-pack-check-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.toLowerCase().startsWith('npm_config_')) delete environment[key];
}

try {
  const result = spawnSync(
    npm,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packageRoot, '--cache', cache],
    {
      encoding: 'utf8',
      env: environment,
    },
  );
  if (result.stdout !== '') {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== '') {
    process.stderr.write(result.stderr);
  }
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const [packed] = JSON.parse(result.stdout);
    const packageSpec = join(packageRoot, packed.filename);
    const smoke = spawnSync(
      process.execPath,
      [join(dirname(fileURLToPath(import.meta.url)), 'post-publish-smoke.mjs'), packageSpec],
      { encoding: 'utf8', env: environment },
    );
    if (smoke.stdout !== '') process.stdout.write(smoke.stdout);
    if (smoke.stderr !== '') process.stderr.write(smoke.stderr);
    if (smoke.error !== undefined) throw smoke.error;
    process.exitCode = smoke.status ?? 1;
  }
} finally {
  await rm(cache, { recursive: true, force: true });
  await rm(packageRoot, { recursive: true, force: true });
}
