import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ARTIFACT_PATHS, verifyReproducibleBuild } from '../scripts/repro-build.mjs';

test('reproducible build rejects output that differs from committed TypeScript bundles', async (context) => {
  // Given
  const repository = await mkdtemp(join(tmpdir(), 'nunch-skills-repro-build-test-'));
  context.after(() => rm(repository, { recursive: true, force: true }));
  for (const path of ARTIFACT_PATHS) {
    await mkdir(join(repository, path, '..'), { recursive: true });
    await writeFile(join(repository, path), 'committed\n');
  }

  // When / Then
  await assert.rejects(
    verifyReproducibleBuild(repository, async (repo) => {
      await Promise.all(ARTIFACT_PATHS.map((path) => writeFile(join(repo, path), 'built\n')));
    }),
    /built bundle differs from committed release artifact/,
  );
});
