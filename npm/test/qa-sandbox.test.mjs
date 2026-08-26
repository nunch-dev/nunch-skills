import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import test from 'node:test';

test('qa sandbox exports throwaway homes without inheriting user homes', async (context) => {
  // Given
  const command = [
    '. scripts/qa-sandbox.sh >/dev/null',
    "node -e 'console.log(JSON.stringify({codex:process.env.CODEX_HOME,claude:process.env.CLAUDE_HOME,config:process.env.CLAUDE_CONFIG_DIR}))'",
  ].join('; ');

  // When
  const result = spawnSync('sh', ['-c', command], { encoding: 'utf8' });

  // Then
  assert.equal(result.status, 0, result.stderr);
  const environment = JSON.parse(result.stdout);
  context.after(() => rm(environment.codex.replace(/\/codex$/, ''), { recursive: true, force: true }));
  assert.match(environment.codex, /nunch-skills-qa-.+\/codex$/);
  assert.match(environment.claude, /nunch-skills-qa-.+\/claude$/);
  assert.equal(environment.claude, environment.config);
});
