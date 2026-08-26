import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = new URL('../bin/nunch-skills.mjs', import.meta.url);
const launcherPath = fileURLToPath(launcher);

test('public launcher exposes the install command', () => {
  // Given / When
  const result = spawnSync(process.execPath, [launcherPath, 'install', '--help'], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 0, result.stderr);
});

test('public launcher shows help without a TTY', () => {
  // Given / When
  const result = spawnSync(process.execPath, [launcherPath], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 0, result.stderr);
});

test('rejects invalid invocation before release discovery', async () => {
  // Given
  const isolated = await mkdtemp(join(tmpdir(), 'nunch-launcher-isolated-'));
  const isolatedLauncher = join(isolated, 'nunch-skills.mjs');
  await copyFile(launcherPath, isolatedLauncher);

  // When
  const result = spawnSync(process.execPath, [isolatedLauncher, 'install', '--no-tui', '--platform=codex'], {
    encoding: 'utf8',
    cwd: isolated,
  });

  // Then
  assert.equal(result.status, 2);
});
