import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
  assert.equal(report[2]?.detail, '원인: Codex CLI 실행 실패 → 실행 파일을 찾을 수 없음');
});

test('emits progress while each executable probe is running', async () => {
  // Given
  const events: string[] = [];
  const probe = new FixtureProbe(events);

  // When
  await runDoctor(probe, (name: string, status: 'started' | 'completed' | 'failed', detail?: string) =>
    events.push(detail === undefined ? `${name}:${status}` : `${name}:${status}:${detail}`),
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
    'Codex CLI:failed:원인: Codex CLI 실행 실패 → 실행 파일을 찾을 수 없음',
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

test('includes individual dependency setup items in warnings', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-doctor-'));
  await writeFile(
    join(root, 'dependencies.json'),
    JSON.stringify({ schemaVersion: 1, manual: [{ name: 'Kaneo MCP' }] }),
  );
  const store = new LifecycleStore(join(root, 'lifecycle.json'));

  // When
  const report = await runLifecycleDoctor({ backend: new DependencyWarningBackend(root), store });

  // Then
  assert.match(report[0]?.detail ?? '', /수동 설정: Kaneo MCP \(fixture\)/);
});

class FixtureProbe implements ExecutableProbe {
  events: string[];

  constructor(events: string[] = []) {
    this.events = events;
  }

  async version(command: string): Promise<string> {
    this.events.push(`${command}:probe`);
    if (command === 'codex') throw new Error('Codex CLI 실행 실패', { cause: new Error('실행 파일을 찾을 수 없음') });
    return `${command} 1.0.0`;
  }
}

class HealthyBackend implements DoctorBackend {
  async listPluginRecords(): ReturnType<DoctorBackend['listPluginRecords']> {
    return [];
  }

  async verifyManagerIntegrity(): Promise<string> {
    return `sha256:${'a'.repeat(64)}`;
  }

  async verifyTrust(): Promise<void> {}
}

class DependencyWarningBackend extends HealthyBackend {
  root: string;

  constructor(root: string) {
    super();
    this.root = root;
  }

  async listPluginRecords(): ReturnType<DoctorBackend['listPluginRecords']> {
    return [
      {
        pluginId: 'fixture',
        name: 'fixture',
        marketplaceName: 'fixture',
        version: '1.0.0',
        installed: true,
        source: { path: this.root },
      },
    ];
  }
}
