import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveInstallOperation } from '../src/lifecycle-command.ts';

const emptyPreState = { plugins: [], marketplace: false, trust: false };

test('installs when the target has no Nunch plugins', () => {
  // Given
  const state = { schemaVersion: 1 as const, resources: [] };

  // When
  const operation = resolveInstallOperation(state, emptyPreState, '0.2.0');

  // Then
  assert.equal(operation, 'install');
});

test('updates an older managed installation when install is run again', () => {
  // Given
  const state = {
    schemaVersion: 1 as const,
    resources: [],
    lastKnownGood: { version: '0.1.6', commit: 'a'.repeat(40) },
  };
  const preState = { ...emptyPreState, plugins: ['nunch-skills'], marketplace: true };

  // When
  const operation = resolveInstallOperation(state, preState, '0.2.0');

  // Then
  assert.equal(operation, 'update');
});

test('verifies the same managed version through the install transaction', () => {
  // Given
  const state = {
    schemaVersion: 1 as const,
    resources: [],
    lastKnownGood: { version: '0.2.0', commit: 'a'.repeat(40) },
  };
  const preState = { ...emptyPreState, plugins: ['nunch-skills'], marketplace: true };

  // When
  const operation = resolveInstallOperation(state, preState, '0.2.0');

  // Then
  assert.equal(operation, 'install');
});

test('refuses an install that would downgrade a managed installation', () => {
  // Given
  const state = {
    schemaVersion: 1 as const,
    resources: [],
    lastKnownGood: { version: '0.3.0', commit: 'a'.repeat(40) },
  };
  const preState = { ...emptyPreState, plugins: ['nunch-skills'], marketplace: true };

  // When / Then
  assert.throws(() => resolveInstallOperation(state, preState, '0.2.0'), /downgrade/);
});

test('refuses to adopt an existing installation without lifecycle state', () => {
  // Given
  const state = { schemaVersion: 1 as const, resources: [] };
  const preState = { ...emptyPreState, plugins: ['nunch-skills'], marketplace: true };

  // When / Then
  assert.throws(() => resolveInstallOperation(state, preState, '0.2.0'), /lifecycle state/);
});
