import assert from 'node:assert/strict';
import test from 'node:test';

import { addResource, createLifecycleState } from '../../plugins/nunch-skills/runtime/src/state.ts';
import { applyOwnershipResult, selectedUninstallPlugins, uninstallExecution } from '../src/ownership.ts';

test('records pre-existing marketplace and trust without promoting ownership', () => {
  // Given
  const state = createLifecycleState();

  // When
  const result = applyOwnershipResult({
    state,
    operation: 'install',
    plugins: ['git-tools'],
    preState: {
      plugins: ['nunch-skills'],
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
    name: 'nunch-skills@nunch-skills',
    ownership: 'created',
  });
  state = addResource(state, {
    kind: 'plugin',
    name: 'git-tools@nunch-skills',
    ownership: 'pre-existing',
    preStateFingerprint: '0.2.1',
  });
  state = addResource(state, { kind: 'trust', name: 'installer-session-start', ownership: 'created' });
  state = addResource(state, { kind: 'marketplace', name: 'nunch-skills', ownership: 'created' });

  // When
  const plan = uninstallExecution(state, ['nunch-skills']);

  // Then
  assert.deepEqual(plan.plugins, ['nunch-skills']);
  assert.equal(plan.removeTrust, true);
  assert.equal(plan.removeMarketplace, false);
});

test('selects uninstall plugins only when recorded for the target', () => {
  // Given
  let state = createLifecycleState();
  state = addResource(state, {
    kind: 'plugin',
    name: 'git-tools@nunch-skills',
    ownership: 'created',
  });

  // When
  const selected = selectedUninstallPlugins(state, ['git-tools', 'nunch-skills']);

  // Then
  assert.deepEqual(selected, ['git-tools']);
});

test('update replaces legacy plugin ownership with the bundled plugin', () => {
  // Given
  let state = createLifecycleState();
  state = addResource(state, { kind: 'plugin', name: 'git-tools@nunch-skills', ownership: 'created' });
  state = addResource(state, { kind: 'plugin', name: 'nch-installer@nunch-skills', ownership: 'created' });

  // When
  const result = applyOwnershipResult({
    state,
    operation: 'update',
    plugins: [],
    preState: { plugins: ['git-tools', 'nch-installer'], marketplace: true, trust: true },
  });

  // Then
  assert.deepEqual(
    result.resources.filter((resource) => resource.kind === 'plugin'),
    [{ kind: 'plugin', name: 'nunch-skills@nunch-skills', ownership: 'created' }],
  );
});
