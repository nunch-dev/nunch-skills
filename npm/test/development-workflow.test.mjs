import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pull request CI separates fast tests, static checks, and package checks', async () => {
  // Given
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

  // When
  const commands = [
    'pnpm run test:fast',
    'pnpm run typecheck',
    'pnpm run lint',
    'pnpm run build',
    'pnpm run pack:check',
  ];

  // Then
  for (const command of commands) assert.match(workflow, new RegExp(command.replaceAll(' ', '\\s+')));
});

test('local development docs pass CLI arguments through pnpm without a literal separator', async () => {
  // Given
  const guide = await readFile(new URL('../../docs/local-development.md', import.meta.url), 'utf8');

  // When
  const directCommands = guide.match(/^pnpm run dev:cli.*$/gm) ?? [];

  // Then
  assert.ok(directCommands.length > 0);
  for (const command of directCommands) assert.doesNotMatch(command, /dev:cli -- /);
  assert.match(guide, /pnpm run dev:cli doctor --status --platform=codex/);
});
