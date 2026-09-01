import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLifecycleState } from '../src/state.ts';
import { acquireLock, LifecycleStore, syncDirectory } from '../src/store.ts';

test('skips directory fsync on Windows', async () => {
  // Given
  const missing = join(tmpdir(), `missing-${randomUUID()}`);

  // When / Then
  await syncDirectory(missing, 'win32');
});

test('persists and reloads a strict lifecycle state', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-store-'));
  const path = join(root, 'lifecycle.json');
  const store = new LifecycleStore(path);

  // When
  await store.save(createLifecycleState());

  // Then
  assert.deepEqual(await store.load(), createLifecycleState());
  assert.equal((await readFile(path, 'utf8')).endsWith('\n'), true);
});

test('rejects unknown lifecycle state fields', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-store-'));
  const path = join(root, 'lifecycle.json');
  await writeFile(path, '{"schemaVersion":1,"resources":[],"unknown":true}\n');

  // When / Then
  await assert.rejects(() => new LifecycleStore(path).load());
});

test('rejects duplicated lifecycle resources', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-store-'));
  const path = join(root, 'lifecycle.json');
  const resource = { kind: 'plugin', name: 'git-tools@nunch-skills', ownership: 'created' };
  await writeFile(path, `${JSON.stringify({ schemaVersion: 1, resources: [resource, resource] })}\n`);

  // When / Then
  await assert.rejects(() => new LifecycleStore(path).load(), /duplicated/);
});

test('refuses a second live lock owner', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-lock-'));
  const path = join(root, 'lifecycle.lock');
  const first = await acquireLock(path, Date.now(), 600_000);

  // When / Then
  await assert.rejects(() => acquireLock(path, Date.now(), 600_000), /busy/);
  await first.release();
});

test('does not release a lock replaced by another owner', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-lock-'));
  const path = join(root, 'lifecycle.lock');
  const first = await acquireLock(path, Date.now(), 600_000);
  const replacement = {
    owner: '00000000-0000-4000-8000-000000000000',
    pid: process.pid,
    createdAt: Date.now(),
  };
  await writeFile(path, `${JSON.stringify(replacement)}\n`);

  // When / Then
  await assert.rejects(() => first.release(), /ownership/);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), replacement);
});
