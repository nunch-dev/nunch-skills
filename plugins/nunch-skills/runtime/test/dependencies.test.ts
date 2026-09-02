import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { z } from 'zod';

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

test('does not require Kaneo MCP when the REST API can be used', async () => {
  // Given
  const manifestPath = join(import.meta.dirname, '../../dependencies.json');

  // When
  const manifest = z
    .object({
      executables: z.array(
        z.object({
          name: z.string(),
          requirement: z.string(),
          candidates: z.array(z.string()),
          versionArgs: z.array(z.string()),
        }),
      ),
      manual: z.array(z.object({ name: z.string() })),
    })
    .parse(JSON.parse(await readFile(manifestPath, 'utf8')));

  // Then
  assert.equal(
    manifest.executables.some((dependency) => dependency.name === 'kaneo-mcp'),
    false,
  );
  assert.equal(
    manifest.manual.some((dependency) => dependency.name === 'Kaneo MCP'),
    false,
  );
});
