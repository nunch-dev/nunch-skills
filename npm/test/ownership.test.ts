import assert from 'node:assert/strict';
import test from 'node:test';

import { addResource, createLifecycleState } from '../../plugins/nunch-skills-manager/runtime/src/state.ts';
import { applyOwnershipResult, uninstallExecution } from '../src/ownership.ts';

test('records pre-existing marketplace and trust without promoting ownership', () => {
  // Given
  const state = createLifecycleState();

  // When
  const result = applyOwnershipResult({
    state,
    operation: 'install',
    plugins: ['git-tools'],
    preState: {
      plugins: ['nunch-skills-manager'],
      marketplace: true,
      trust: true,
    },
  });

  // Then
  assert.equal(result.resources.find((resource) => resource.kind === 'marketplace')?.ownership, 'pre-existing');
  assert.equal(result.resources.find((resource) => resource.kind === 'trust')?.ownership, 'pre-existing');
});

test('full teardown plans only resources recorded as created', () => {
  // Given
  let state = createLifecycleState();
  state = addResource(state, {
    kind: 'plugin',
    name: 'nunch-skills-manager@nunch-skills',
    ownership: 'created',
  });
  state = addResource(state, {
    kind: 'plugin',
    name: 'git-tools@nunch-skills',
    ownership: 'pre-existing',
    preStateFingerprint: '0.2.1',
  });
  state = addResource(state, { kind: 'trust', name: 'manager-session-start', ownership: 'created' });
  state = addResource(state, { kind: 'marketplace', name: 'nunch-skills', ownership: 'created' });

  // When
  const plan = uninstallExecution(state, ['nunch-skills-manager']);

  // Then
  assert.deepEqual(plan.plugins, ['nunch-skills-manager']);
  assert.equal(plan.removeTrust, true);
  assert.equal(plan.removeMarketplace, false);
});
