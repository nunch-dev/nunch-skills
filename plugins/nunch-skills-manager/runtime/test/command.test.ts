import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommandInvocation } from '../src/command.ts';

test('routes a Windows command shim through cmd.exe', () => {
  // Given
  const command = 'C:\\Program Files\\nunch tools\\codex.cmd';
  const args = ['plugin', 'list', 'value with spaces'];

  // When
  const invocation = resolveCommandInvocation(command, args, {
    platform: 'win32',
    comSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  // Then
  assert.deepEqual(invocation, {
    file: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  });
});

test('executes a Windows executable directly', () => {
  // Given
  const command = 'C:\\Program Files\\Git\\cmd\\git.exe';
  const args = ['--version'];

  // When
  const invocation = resolveCommandInvocation(command, args, {
    platform: 'win32',
    comSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  // Then
  assert.deepEqual(invocation, { file: command, args });
});
