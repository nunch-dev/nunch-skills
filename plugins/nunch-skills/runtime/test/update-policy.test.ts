import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  compareInstalledVersion,
  installedReleaseVersion,
  isStrictStableUpgrade,
  shouldCheck,
} from '../src/update-policy.ts';

test('reads the npm release version from the lifecycle ledger', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'installed-release-'));
  const data = join(root, 'plugins', 'data', 'nunch-skills');
  await mkdir(data, { recursive: true });
  await writeFile(
    join(data, 'lifecycle.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      resources: [],
      lastKnownGood: { version: '0.1.2', commit: 'a'.repeat(40) },
    })}\n`,
  );

  // When
  const version = await installedReleaseVersion(root);

  // Then
  assert.equal(version, '0.1.2');
});

test('accepts only a strictly newer stable release', () => {
  // Given / When / Then
  assert.equal(isStrictStableUpgrade('0.1.2', '0.1.3'), true);
  assert.equal(isStrictStableUpgrade('0.1.2', '0.1.2'), false);
  assert.equal(isStrictStableUpgrade('0.1.2', '0.1.3-beta.1'), false);
  assert.equal(isStrictStableUpgrade('0.1.2', '0.1.1'), false);
});

test('orders installed stable versions against the requested release', () => {
  // Given / When / Then
  assert.equal(compareInstalledVersion('0.1.6', '0.2.0'), 'older');
  assert.equal(compareInstalledVersion('0.2.0', '0.2.0'), 'same');
  assert.equal(compareInstalledVersion('0.3.0', '0.2.0'), 'newer');
  assert.throws(() => compareInstalledVersion('0.2.0-beta.1', '0.2.0'), /stable SemVer/);
});

test('retries failed checks sooner than successful checks', () => {
  // Given
  const now = Date.now();

  // When / Then
  assert.equal(shouldCheck('failed', now - 31 * 60_000, now), true);
  assert.equal(shouldCheck('success', now - 31 * 60_000, now), false);
});
