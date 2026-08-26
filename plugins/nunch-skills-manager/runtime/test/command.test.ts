import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execCommand, resolveCommandInvocation } from '../src/command.ts';

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

test('executes a Windows command shim through the native shell', { skip: process.platform !== 'win32' }, async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'nunch-windows-command-'));
  await writeFile(join(root, 'codex.cmd'), '@echo off\r\necho codex-cli 1.0.0\r\n');

  try {
    // When
    const result = await execCommand('codex', ['--version'], { platform: 'win32', pathEnv: root });

    // Then
    assert.equal(result.stdout.trim(), 'codex-cli 1.0.0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
