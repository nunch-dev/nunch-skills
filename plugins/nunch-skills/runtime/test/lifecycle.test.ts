import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { type LifecycleBackend, LifecycleService } from '../src/lifecycle.ts';
import { recoverLifecycleTransaction, runLifecycleTransaction } from '../src/lifecycle-transaction.ts';
import { beginOperation, createLifecycleState } from '../src/state.ts';
import { LifecycleStore } from '../src/store.ts';

test('install adds the bundled plugin exactly once', async () => {
  // Given
  const backend = new RecordingBackend();
  const service = new LifecycleService(backend);

  // When
  await service.install(['nunch-skills']);

  // Then
  assert.deepEqual(backend.installed, ['nunch-skills']);
});

test('update applies the installed bundle as one release', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills']);
  const service = new LifecycleService(backend);

  // When
  await service.update();

  // Then
  assert.deepEqual(backend.updated, ['nunch-skills']);
});

test('update migrates legacy leaf plugins into the bundled plugin', async () => {
  // Given
  const backend = new RecordingBackend(['nch-installer', 'git-tools', 'humanize-korean']);
  const service = new LifecycleService(backend);

  // When
  await service.update();

  // Then
  assert.deepEqual(backend.installed, ['nunch-skills']);
  assert.deepEqual(backend.removed, ['git-tools', 'humanize-korean', 'nch-installer']);
  assert.equal(backend.trustRemoved, true);
});

test('update removes old hook trust before replacing the installer payload', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills']);
  const service = new LifecycleService(backend);

  // When
  await service.update();

  // Then
  assert.deepEqual(backend.events, ['marketplace', 'remove-trust', 'update:nunch-skills', 'ensure-trust']);
});

test('uninstall removes selected leaf plugins without removing the installer', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills', 'git-tools', 'humanize-korean']);
  const service = new LifecycleService(backend);

  // When
  await service.uninstall(['git-tools']);

  // Then
  assert.deepEqual(backend.removed, ['git-tools']);
  assert.equal(backend.trustRemoved, false);
});

test('installer selection performs a full teardown with installer last', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills']);
  const service = new LifecycleService(backend);

  // When
  await service.uninstall(['nunch-skills']);

  // Then
  assert.deepEqual(backend.removed, ['nunch-skills']);
  assert.equal(backend.trustRemoved, true);
  assert.equal(backend.marketplaceRemoved, true);
});

test('rolls back the whole release when an update plugin fails', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills', 'git-tools']);
  backend.failUpdate = true;
  const service = new LifecycleService(backend);
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-transaction-'));
  const store = new LifecycleStore(join(root, 'lifecycle.json'));

  // When
  await assert.rejects(() =>
    runLifecycleTransaction(
      {
        store,
        backend,
        operation: 'update',
        release: { version: '1.2.3', commit: 'a'.repeat(40) },
        operationId: 'update-1',
        startedAt: '2026-08-23T00:00:00.000Z',
      },
      async (state) => {
        await service.update();
        return state;
      },
    ),
  );

  // Then
  assert.equal(backend.snapshots, 1);
  assert.equal(backend.rollbacks, 1);
  assert.equal(backend.commits, 1);
  assert.equal((await store.load()).operation, undefined);
});

test('failed install preserves plugins that existed before the operation', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills']);
  backend.failInstallTarget = 'git-tools';
  const service = new LifecycleService(backend);

  // When / Then
  await assert.rejects(() => service.install(['git-tools']));
  assert.deepEqual(backend.removed, []);
});

test('install without installer skips the installer and trust stages', async () => {
  // Given
  const backend = new RecordingBackend();
  const service = new LifecycleService(backend, undefined, { includeInstaller: false });

  // When
  await service.install(['git-tools', 'humanize-korean']);

  // Then
  assert.deepEqual(backend.installed, ['git-tools', 'humanize-korean']);
  assert.deepEqual(backend.events, ['marketplace', 'install:git-tools', 'install:humanize-korean']);
});

test('installer teardown removes only the selected created plugins', async () => {
  // Given
  const backend = new RecordingBackend(['nunch-skills', 'git-tools']);
  const service = new LifecycleService(backend);

  // When
  await service.uninstall(['nunch-skills']);

  // Then
  assert.deepEqual(backend.removed, ['nunch-skills']);
});

test('recovers an interrupted lifecycle operation before the next transaction', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-recovery-'));
  const store = new LifecycleStore(join(root, 'lifecycle.json'));
  const backend = new RecordingBackend();
  await store.save(
    beginOperation(createLifecycleState(), {
      id: 'install-1',
      kind: 'install',
      startedAt: '2026-08-23T00:00:00.000Z',
    }),
  );

  // When
  await recoverLifecycleTransaction(store, backend);

  // Then
  assert.equal(backend.rollbacks, 1);
  assert.equal(backend.commits, 1);
  assert.equal((await store.load()).operation, undefined);
});

class RecordingBackend implements LifecycleBackend {
  installed: string[] = [];
  updated: string[] = [];
  removed: string[] = [];
  trustRemoved = false;
  marketplaceRemoved = false;
  failUpdate = false;
  failInstallTarget: string | undefined;
  snapshots = 0;
  rollbacks = 0;
  commits = 0;
  events: string[] = [];
  plugins: string[];

  constructor(plugins: string[] = []) {
    this.plugins = plugins;
  }

  async listInstalled(): Promise<string[]> {
    return this.plugins;
  }
  async inspectPreState(): Promise<{ plugins: string[]; marketplace: boolean; trust: boolean }> {
    return { plugins: this.plugins, marketplace: true, trust: true };
  }
  async installPlugin(name: string): Promise<void> {
    if (name === this.failInstallTarget) throw new Error('install failure');
    this.installed.push(name);
    this.events.push(`install:${name}`);
  }
  async updatePlugin(name: string): Promise<void> {
    if (this.failUpdate) throw new Error('update failure');
    this.updated.push(name);
    this.events.push(`update:${name}`);
  }
  async removePlugin(name: string): Promise<void> {
    this.removed.push(name);
  }
  async ensureMarketplace(): Promise<void> {
    this.events.push('marketplace');
  }
  async ensureTrust(): Promise<void> {
    this.events.push('ensure-trust');
  }
  async removeTrust(): Promise<void> {
    this.trustRemoved = true;
    this.events.push('remove-trust');
  }
  async removeMarketplace(): Promise<void> {
    this.marketplaceRemoved = true;
  }
  async verifyRelease(): Promise<void> {}
  async snapshot(): Promise<void> {
    this.snapshots += 1;
  }
  async rollback(): Promise<void> {
    this.rollbacks += 1;
  }
  async commit(): Promise<void> {
    this.commits += 1;
  }
}
