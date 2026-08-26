import assert from 'node:assert/strict';
import test from 'node:test';

import { runTestFast, testFastGroups } from '../../scripts/test-fast.mjs';

test('defines independent test groups for parallel local feedback', () => {
  // Given / When
  const groups = testFastGroups();

  // Then
  assert.deepEqual(
    groups.map((group) => group.name),
    ['package-surface', 'typescript-runtime', 'upstream-sync'],
  );
});

test('runs every fast test group concurrently', async () => {
  // Given
  let active = 0;
  let maximumActive = 0;
  const runner = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return 0;
  };

  // When
  const code = await runTestFast(runner);

  // Then
  assert.equal(code, 0);
  assert.equal(maximumActive, 3);
});

test('fails fast test aggregation when one group fails', async () => {
  // Given
  const runner = async (group) => (group.name === 'typescript-runtime' ? 1 : 0);

  // When
  const code = await runTestFast(runner);

  // Then
  assert.equal(code, 1);
});
