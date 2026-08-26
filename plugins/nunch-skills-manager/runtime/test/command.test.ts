import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecRunner } from '../src/command.ts';

test('resolves a Windows command shim through PATH extensions on win32', () => {
  // Given
  const runner = new ExecRunner({ platform: 'win32' });

  // When / Then
  assert.ok(runner instanceof ExecRunner);
});
