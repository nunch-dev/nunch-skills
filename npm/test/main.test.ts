import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldUseInteractiveUi } from '../src/main.ts';

test('does not render lifecycle completion UI for help requests', () => {
  // Given
  const terminal = { stdinTty: true, stdoutTty: true };

  // When / Then
  assert.equal(shouldUseInteractiveUi({ ...terminal, argv: ['install', '--help'] }), false);
  assert.equal(shouldUseInteractiveUi({ ...terminal, argv: ['setup', '-h'] }), false);
  assert.equal(shouldUseInteractiveUi({ ...terminal, argv: ['install'] }), true);
});
