import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('npm pack --dry-run publishes only the declared package surface', async (context) => {
  const cache = await mkdtemp(join(tmpdir(), 'nunch-skills-pack-cache-'));
  context.after(() => rm(cache, { recursive: true, force: true }));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['pack', '--dry-run', '--json', '--cache', cache], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const [pack] = JSON.parse(result.stdout);
  const paths = pack.files.map((entry) => entry.path).sort();
  const expected = [
    '.agents/plugins/marketplace.json',
    'LICENSE',
    'README.md',
    'npm/bin/nunch-skills.mjs',
    'package.json',
    'plugins/nunch-skills/.codex-plugin/plugin.json',
    'plugins/nunch-skills/hooks/hooks.json',
    'plugins/nunch-skills/runtime/nch-installer.mjs',
    'plugins/nunch-skills/scripts/node-dispatch.ps1',
    'tools/upstream-sync/dist/upstream-sync.mjs',
  ];
  if (await exists(new URL('../../release-manifest.json', import.meta.url))) {
    expected.push('release-manifest.json');
  }
  assert.deepEqual(paths, expected.sort());
});

test('default test command includes TypeScript public CLI tests', async () => {
  // Given
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  // When
  const command = manifest.scripts.test;

  // Then
  assert.match(command, /npm\/test\/\*\.test\.ts/);
});

test('exposes the public TypeScript CLI for local development', async () => {
  // Given
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  // When
  const script = manifest.scripts['dev:cli'];

  // Then
  assert.equal(script, 'node --experimental-strip-types npm/src/entry.ts');
});

test('exposes the minimal local verification commands', async () => {
  // Given
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  // When
  const scripts = {
    fast: manifest.scripts['test:fast'],
    check: manifest.scripts.check,
  };

  // Then
  assert.deepEqual(scripts, {
    fast: 'node scripts/test-fast.mjs',
    check: 'pnpm run typecheck && pnpm run lint && pnpm run build && pnpm test && pnpm run pack:check',
  });
  assert.equal(manifest.scripts['qa:local'], undefined);
  assert.equal(manifest.scripts['qa:all'], undefined);
});

test('does not ship the removed telemetry client', async () => {
  // Given
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  // When
  const dependency = manifest.dependencies['posthog-node'];

  // Then
  assert.equal(dependency, undefined);
});
