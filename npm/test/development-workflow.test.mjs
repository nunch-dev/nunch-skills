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

test('runs runtime and packaged launcher checks on Windows', async () => {
  // Given
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const installSmoke = workflow.slice(workflow.indexOf('  install-smoke:'));

  // When / Then
  assert.match(installSmoke, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(installSmoke, /runtime\/test\/command\.test\.ts/);
  assert.match(installSmoke, /runtime\/test\/doctor\.test\.ts/);
  assert.match(installSmoke, /runtime\/test\/release-tar\.test\.ts/);
  assert.match(installSmoke, /node npm\/bin\/nunch-skills\.mjs doctor --help/);
});

test('runs deep-interview Python tests on Linux and Windows', async () => {
  // Given
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

  // When / Then
  assert.match(workflow, /deep-interview-tests:/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /actions\/setup-python@[0-9a-f]{40}/);
  assert.match(workflow, /astral-sh\/setup-uv@[0-9a-f]{40}/);
  assert.match(workflow, /uv run --python 3\.11 --with pytest pytest -q/);
  assert.match(workflow, /deep-interview\/skills\/deep-interview\/tests/);
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
