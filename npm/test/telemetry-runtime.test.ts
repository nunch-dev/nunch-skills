import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { captureTelemetry } from '../src/telemetry-runtime.ts';

test('telemetry state failures never change the lifecycle result', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'telemetry-runtime-'));
  await writeFile(join(root, 'telemetry.json'), 'invalid json\n');

  // When / Then
  await assert.doesNotReject(() => captureTelemetry('install', ['git-tools'], 'success', 10, root));
});
