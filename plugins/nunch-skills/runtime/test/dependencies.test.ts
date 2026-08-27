import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inspectDependencies } from '../src/dependencies.ts';

test('accepts command-only executable declarations', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'dependency-manifest-'));
  await writeFile(
    join(root, 'dependencies.json'),
    JSON.stringify({
      schemaVersion: 1,
      executables: [{ name: 'node', requirement: 'Node.js', candidates: ['node'], versionArgs: ['--version'] }],
    }),
  );

  // When
  const report = await inspectDependencies([
    {
      pluginId: 'fixture',
      name: 'fixture',
      marketplaceName: 'fixture',
      version: '1.0.0',
      installed: true,
      source: { path: root },
    },
  ]);

  // Then
  assert.deepEqual(report.missing, []);
});
