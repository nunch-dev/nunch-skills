import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runtime = new URL('../nunch-skills-manager.mjs', import.meta.url);

test('disabled SessionStart exits silently without background work', () => {
  // Given / When
  const result = spawnSync(process.execPath, [runtime.pathname, 'hook', 'session-start'], {
    encoding: 'utf8',
    env: { ...process.env, NUNCH_SKILLS_AUTO_UPDATE_DISABLED: '1' },
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
