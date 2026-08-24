import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const launcher = new URL('../bin/nunch-skills.mjs', import.meta.url);
const launcherPath = fileURLToPath(launcher);

test('public launcher rejects explicit lifecycle arguments', () => {
  // Given / When
  const result = spawnSync(process.execPath, [launcherPath, 'install'], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 2);
});

test('public launcher rejects non-TTY execution without mutation', () => {
  // Given / When
  const result = spawnSync(process.execPath, [launcherPath], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 2);
});

test('rejects invalid invocation before release discovery', async () => {
  // Given
  const isolated = await mkdtemp(join(tmpdir(), 'nunch-launcher-isolated-'));
  const isolatedLauncher = join(isolated, 'nunch-skills.mjs');
  await copyFile(launcherPath, isolatedLauncher);

  // When
  const result = spawnSync(process.execPath, [isolatedLauncher, 'install'], {
    encoding: 'utf8',
    cwd: isolated,
  });

  // Then
  assert.equal(result.status, 2);
});
