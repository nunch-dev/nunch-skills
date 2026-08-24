import assert from 'node:assert/strict';
import test from 'node:test';

import { addResource, advanceOperation, beginOperation, createLifecycleState } from '../src/state.ts';

test('starts an install operation in prepared phase', () => {
  // Given
  const state = createLifecycleState();

  // When
  const next = beginOperation(state, {
    id: 'install-1',
    kind: 'install',
    startedAt: '2026-08-23T00:00:00.000Z',
  });

  // Then
  assert.equal(next.operation?.phase, 'prepared');
});

test('rejects invalid operation phase transitions', () => {
  // Given
  const state = beginOperation(createLifecycleState(), {
    id: 'install-1',
    kind: 'install',
    startedAt: '2026-08-23T00:00:00.000Z',
  });

  // When / Then
  assert.throws(() => advanceOperation(state, 'verify'), /transition/);
});

test('does not promote a pre-existing resource to created', () => {
  // Given
  const state = addResource(createLifecycleState(), {
    kind: 'plugin',
    name: 'leaf@nunch-skills',
    ownership: 'pre-existing',
    preStateFingerprint: 'v1',
  });

  // When / Then
  assert.throws(
    () => addResource(state, { kind: 'plugin', name: 'leaf@nunch-skills', ownership: 'created' }),
    /promotion/,
  );
});
