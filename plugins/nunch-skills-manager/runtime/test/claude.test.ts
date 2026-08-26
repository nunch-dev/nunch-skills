import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ClaudeBackend } from '../src/claude.ts';
import type { CommandRunner } from '../src/codex-schema.ts';

test('adds a missing marketplace and installs a plugin', async () => {
  // Given
  const runner = new RecordingRunner(['[]', '{}', '{}']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.ensureMarketplace();
  await backend.installPlugin('git-tools');

  // Then
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'add', 'nunch-dev/nunch-skills'],
    ['claude', 'plugin', 'install', 'git-tools@nunch-skills'],
  ]);
});

test('skips marketplace add when it already exists', async () => {
  // Given
  const runner = new RecordingRunner(['[{"name":"nunch-skills","source":"github","repo":"nunch-dev/nunch-skills"}]']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.ensureMarketplace();

  // Then
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'marketplace', 'list', '--json']]);
});

test('rejects an existing marketplace from another source', async () => {
  // Given
  const runner = new RecordingRunner(['[{"name":"nunch-skills","source":"github","repo":"attacker/nunch-skills"}]']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When / Then
  await assert.rejects(() => backend.ensureMarketplace(), /source/);
});

test('rejects release verification when the marketplace source is not trusted', async () => {
  // Given
  const runner = new RecordingRunner(['[{"name":"nunch-skills","source":"github","repo":"attacker/nunch-skills"}]']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When / Then
  await assert.rejects(() => backend.verifyRelease(), /source/);
});

test('updates marketplace when allowRepin is set and marketplace exists', async () => {
  // Given
  const runner = new RecordingRunner([
    '[{"name":"nunch-skills","source":"github","repo":"nunch-dev/nunch-skills"}]',
    '{}',
  ]);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
    allowRepin: true,
  });

  // When
  await backend.ensureMarketplace();

  // Then
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'marketplace', 'list', '--json'],
    ['claude', 'plugin', 'marketplace', 'update', 'nunch-skills'],
  ]);
});

test('lists only plugins from the target marketplace', async () => {
  // Given
  const runner = new RecordingRunner([
    JSON.stringify([
      { id: 'git-tools@nunch-skills', version: '1.0.0' },
      { id: 'other@elsewhere', version: '2.0.0' },
      { id: 'humanize-korean@nunch-skills', version: '1.5.0' },
    ]),
  ]);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  const installed = await backend.listInstalled();

  // Then
  assert.deepEqual(installed, ['git-tools', 'humanize-korean']);
});

test('removes a plugin using the uninstall subcommand', async () => {
  // Given
  const runner = new RecordingRunner([JSON.stringify([{ id: 'git-tools@nunch-skills', version: '1.0.0' }]), '{}']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.removePlugin('git-tools');

  // Then
  assert.deepEqual(runner.calls, [
    ['claude', 'plugin', 'list', '--json'],
    ['claude', 'plugin', 'uninstall', 'git-tools@nunch-skills'],
  ]);
});

test('skips removal when plugin is not installed', async () => {
  // Given
  const runner = new RecordingRunner([JSON.stringify([])]);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.removePlugin('git-tools');

  // Then
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'list', '--json']]);
});

test('updates a plugin using the update subcommand', async () => {
  // Given
  const runner = new RecordingRunner(['{}']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.updatePlugin('git-tools');

  // Then
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'update', 'git-tools@nunch-skills']]);
});

test('removes the marketplace', async () => {
  // Given
  const runner = new RecordingRunner(['{}']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.removeMarketplace();

  // Then
  assert.deepEqual(runner.calls, [['claude', 'plugin', 'marketplace', 'remove', 'nunch-skills']]);
});

test('inspects pre-state with no marketplace', async () => {
  // Given
  const runner = new RecordingRunner(['[]']);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  const state = await backend.inspectPreState();

  // Then
  assert.deepEqual(state, { plugins: [], marketplace: false, trust: false });
});

test('trust and transaction snapshot operations are no-ops', async () => {
  // Given
  const runner = new RecordingRunner([]);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.ensureTrust();
  await backend.removeTrust();
  await backend.snapshot('install');
  await backend.rollback('install');
  await backend.commit('install');

  // Then
  assert.deepEqual(runner.calls, []);
});
const snapshotOptions = (runner: RecordingRunner, snapshotPath: string) => ({
  runner,
  claudeCommand: 'claude',
  marketplace: 'nunch-skills',
  snapshotPath,
});

test('snapshots installed plugins before an operation and restores them on rollback', async () => {
  // Given: one plugin is installed and a snapshot path is configured.
  const runner = new RecordingRunner([JSON.stringify([{ id: 'git-tools@nunch-skills', version: '1.0.0' }])]);
  const snapshotPath = join(tmpdir(), `claude-snapshot-${randomUUID()}.json`);
  const backend = new ClaudeBackend(snapshotOptions(runner, snapshotPath));

  // When
  await backend.snapshot('update');

  // Then
  const stored = JSON.parse(await readFile(snapshotPath, 'utf8'));
  assert.deepEqual(stored, { operation: 'update', plugins: [{ id: 'git-tools@nunch-skills', version: '1.0.0' }] });

  // Given: a second plugin was installed after the snapshot.
  runner.outputs.push(
    JSON.stringify([
      { id: 'git-tools@nunch-skills', version: '1.0.0' },
      { id: 'new-plugin@nunch-skills', version: '2.0.0' },
    ]),
    '{}',
    '{}',
  );

  // When
  await backend.rollback('update');

  // Then
  assert.deepEqual(runner.calls.slice(1), [
    ['claude', 'plugin', 'list', '--json'],
    ['claude', 'plugin', 'uninstall', 'new-plugin@nunch-skills'],
  ]);
  await rm(snapshotPath);
});

test('rollback without a stored snapshot keeps the current state', async () => {
  // Given
  const runner = new RecordingRunner([]);
  const backend = new ClaudeBackend({
    runner,
    claudeCommand: 'claude',
    marketplace: 'nunch-skills',
  });

  // When
  await backend.rollback('uninstall');

  // Then
  assert.deepEqual(runner.calls, []);
});

class RecordingRunner implements CommandRunner {
  calls: string[][] = [];
  outputs: string[];

  constructor(outputs: string[]) {
    this.outputs = outputs;
  }

  async run(command: string, args: string[]): Promise<string> {
    this.calls.push([command, ...args]);
    const output = this.outputs.shift();
    if (output === undefined) throw new Error('missing test output');
    return output;
  }
}
