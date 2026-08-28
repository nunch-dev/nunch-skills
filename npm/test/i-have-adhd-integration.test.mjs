import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const PLUGIN_ROOT = new URL('../../plugins/nunch-skills/', import.meta.url);

test('bundled SessionStart hook restores i-have-adhd after conversation resets', async () => {
  // Given
  const manifest = JSON.parse(await readFile(new URL('hooks/hooks.json', PLUGIN_ROOT), 'utf8'));

  // When
  const [handler] = manifest.hooks.SessionStart;

  // Then
  assert.equal(handler?.matcher, 'startup|resume|clear|compact');
});

test('bundled i-have-adhd hook injects the canonical skill after opt in', async (context) => {
  // Given
  const configRoot = await mkdtemp(join(tmpdir(), 'nunch-skills-adhd-hook-'));
  context.after(() => rm(configRoot, { recursive: true, force: true }));
  await writeFile(join(configRoot, '.i-have-adhd-always'), '');
  const skill = await readFile(new URL('skills/i-have-adhd/SKILL.md', PLUGIN_ROOT), 'utf8');
  const body = skill.replace(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, '').trimEnd();

  // When
  const result = spawnSync(
    process.execPath,
    [new URL('runtime/nch-installer.mjs', PLUGIN_ROOT).pathname, 'hook', 'session-start'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: configRoot,
        NUNCH_SKILLS_AUTO_UPDATE_DISABLED: '1',
        PLUGIN_DATA: join(configRoot, 'plugin-data'),
      },
    },
  );

  // Then
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.additionalContext.endsWith(body), true);
});
