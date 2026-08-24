import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { type DoctorBackend, type ExecutableProbe, runDoctor, runLifecycleDoctor } from '../src/doctor.ts';
import { LifecycleStore } from '../src/store.ts';

test('reports each executable independently', async () => {
  // Given
  const probe = new FixtureProbe();

  // When
  const report = await runDoctor(probe);

  // Then
  assert.deepEqual(
    report.map((item) => [item.name, item.status]),
    [
      ['Node.js', 'ok'],
      ['Git', 'ok'],
      ['Codex CLI', 'error'],
    ],
  );
});

test('emits progress while each executable probe is running', async () => {
  // Given
  const events: string[] = [];
  const probe = new FixtureProbe(events);

  // When
  await runDoctor(probe, (name: string, status: 'started' | 'completed' | 'failed') =>
    events.push(`${name}:${status}`),
  );

  // Then
  assert.deepEqual(events, [
    'Node.js:started',
    'node:probe',
    'Node.js:completed',
    'Git:started',
    'git:probe',
    'Git:completed',
    'Codex CLI:started',
    'codex:probe',
    'Codex CLI:failed',
  ]);
});

test('reports the five lifecycle diagnostic categories', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-doctor-'));
  const store = new LifecycleStore(join(root, 'lifecycle.json'));

  // When
  const report = await runLifecycleDoctor({ backend: new HealthyBackend(), store });

  // Then
  assert.deepEqual(
    report.map((item) => item.name),
    ['dependencies', 'integrity', 'transaction', 'trust', 'ownership'],
  );
  assert.equal(
    report.every((item) => item.status === 'ok'),
    true,
  );
});

class FixtureProbe implements ExecutableProbe {
  events: string[];

  constructor(events: string[] = []) {
    this.events = events;
  }

  async version(command: string): Promise<string> {
    this.events.push(`${command}:probe`);
    if (command === 'codex') throw new Error('missing');
    return `${command} 1.0.0`;
  }
}

class HealthyBackend implements DoctorBackend {
  async listPluginRecords(): Promise<[]> {
    return [];
  }

  async verifyManagerIntegrity(): Promise<string> {
    return `sha256:${'a'.repeat(64)}`;
  }

  async verifyTrust(): Promise<void> {}
}
