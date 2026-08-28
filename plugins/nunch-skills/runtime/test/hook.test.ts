import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const runtime = new URL('../nch-installer.mjs', import.meta.url);

test('disabled SessionStart exits silently without background work', () => {
  // Given
  const pluginData = mkdtempSync(join(tmpdir(), 'nunch-disabled-hook-'));

  // When
  const result = spawnSync(process.execPath, [runtime.pathname, 'hook', 'session-start'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_HOME: join(pluginData, 'codex'),
      NUNCH_SKILLS_AUTO_UPDATE_DISABLED: '1',
      PLUGIN_DATA: pluginData,
      PLUGIN_ROOT: '/tmp/nunch-codex-plugin',
    },
  });

  // Then
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('Claude SessionStart does not launch the Codex automatic updater', () => {
  // Given
  const pluginData = mkdtempSync(join(tmpdir(), 'nunch-claude-hook-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_PLUGIN_DATA: pluginData,
    CLAUDE_PLUGIN_ROOT: '/tmp/nunch-claude-plugin',
    CODEX_HOME: join(pluginData, 'codex'),
    PATH: '',
  };
  delete env['PLUGIN_DATA'];
  delete env['PLUGIN_ROOT'];

  // When
  const result = spawnSync(process.execPath, [runtime.pathname, 'hook', 'session-start'], {
    encoding: 'utf8',
    env,
  });

  // Then
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('rejects unknown internal commands', () => {
  // Given / When
  const result = spawnSync(process.execPath, [runtime.pathname, 'unknown'], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid/);
});
