import assert from 'node:assert/strict';
import test from 'node:test';

import { clipboardCommand } from '../src/clipboard.ts';

test('selects the native clipboard command for each supported platform', () => {
  // Given
  const platforms = ['darwin', 'win32', 'linux'] as const;

  // When
  const commands = platforms.map(clipboardCommand);

  // Then
  assert.deepEqual(commands, [
    { command: 'pbcopy', args: [] },
    { command: 'clip', args: [] },
    { command: 'wl-copy', args: [] },
  ]);
});
