import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Telemetry, type TelemetrySink, telemetryProperties } from '../src/telemetry.ts';
import { appendTelemetryDiagnostic, clearTelemetryData, setTelemetryEnabled } from '../src/telemetry-state.ts';

test('emits only allowlisted lifecycle properties', () => {
  // Given
  const input = {
    cliVersion: '1.2.3',
    os: 'darwin',
    arch: 'arm64',
    operation: 'install' as const,
    result: 'success' as const,
    errorCode: 'none',
    durationMs: 1520,
    pluginIds: ['git-tools', 'humanize-korean'],
  };

  // When
  const properties = telemetryProperties(input);

  // Then
  assert.deepEqual(properties, {
    cli_version: '1.2.3',
    os: 'darwin',
    arch: 'arm64',
    operation: 'install',
    result: 'success',
    error_code: 'none',
    duration_bucket: '1s-5s',
    plugin_count: 2,
    plugin_ids: ['git-tools', 'humanize-korean'],
    $process_person_profile: false,
  });
});

test('swallows telemetry sink failures', async () => {
  // Given
  const sink = new ThrowingSink();
  const telemetry = new Telemetry({ enabled: true, installationId: 'installation-1', sink });

  // When / Then
  await assert.doesNotReject(() =>
    telemetry.capture({
      cliVersion: '1.2.3',
      os: 'linux',
      arch: 'x64',
      operation: 'doctor',
      result: 'failure',
      errorCode: 'doctor_failed',
      durationMs: 20,
      pluginIds: [],
    }),
  );
});

class ThrowingSink implements TelemetrySink {
  async capture(): Promise<void> {
    throw new Error('network failure');
  }
}

test('bounds local telemetry diagnostics', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'telemetry-diagnostics-'));
  const path = join(root, 'telemetry-diagnostics.jsonl');
  const row = `${JSON.stringify({ event: 'capture_failed', occurredAt: Date.now() })}\n`;
  await writeFile(path, row.repeat(6000));

  // When
  await appendTelemetryDiagnostic(path, 'capture_failed', Date.now());

  // Then
  assert.equal((await stat(path)).size <= 256 * 1024, true);
  assert.doesNotMatch(await readFile(path, 'utf8'), /token|prompt|path/);
});

test('clears the persistent telemetry identity', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'telemetry-clear-'));
  const path = join(root, 'telemetry.json');
  await writeFile(path, '{"enabled":true,"installationId":"00000000-0000-4000-8000-000000000000"}\n');

  // When
  await clearTelemetryData(root);

  // Then
  await assert.rejects(() => readFile(path), /ENOENT/);
});

test('opt-out persists no installation identity', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'telemetry-opt-out-'));
  const path = join(root, 'telemetry.json');
  await writeFile(path, '{"enabled":true,"installationId":"00000000-0000-4000-8000-000000000000"}\n');

  // When
  await setTelemetryEnabled(path, false);

  // Then
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { enabled: false });
});
