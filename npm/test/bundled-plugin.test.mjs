import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const PLUGIN_ROOT = new URL('../../plugins/nunch-skills/', import.meta.url);

const readJson = async (path) => JSON.parse(await readFile(new URL(path, REPOSITORY_ROOT), 'utf8'));

test('one nunch-skills plugin bundles every published skill', async () => {
  // Given
  const expectedSkills = [
    'deep-interview',
    'docs-fairy',
    'docs-fairy-site',
    'git-tools',
    'humanize',
    'humanize-korean',
    'humanize-redo',
    'i-have-adhd',
    'kaneo-skills',
    'ready-to-fight',
  ];

  // When
  const marketplace = await readJson('.agents/plugins/marketplace.json');
  const codexManifest = await readJson('plugins/nunch-skills/.codex-plugin/plugin.json');
  const claudeManifest = await readJson('plugins/nunch-skills/.claude-plugin/plugin.json');
  const skills = (await readdir(new URL('skills/', PLUGIN_ROOT), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  // Then
  assert.deepEqual(marketplace.plugins, [
    {
      name: 'nunch-skills',
      source: { source: 'local', path: './plugins/nunch-skills' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools',
    },
  ]);
  assert.equal(codexManifest.name, 'nunch-skills');
  assert.equal(codexManifest.version, (await readJson('package.json')).version);
  assert.equal(claudeManifest.name, codexManifest.name);
  assert.equal(claudeManifest.version, codexManifest.version);
  assert.deepEqual(skills, expectedSkills);
});

test('i-have-adhd allows Codex implicit invocation', async () => {
  // Given / When
  const codexMetadata = await readFile(new URL('skills/i-have-adhd/agents/openai.yaml', PLUGIN_ROOT), 'utf8');

  // Then
  assert.match(codexMetadata, /^ {2}allow_implicit_invocation: true$/m);
});

test('humanize runtime scripts resolve bundled skill references from their installed directory', async () => {
  // Given
  const runDirectory = await mkdtemp(join(tmpdir(), 'humanize-runtime-'));
  const inputPath = join(runDirectory, '01_input.txt');
  const finalPath = join(runDirectory, 'final.md');
  const input = '오늘 아침에는 창문을 열었다. 비가 그친 뒤라 공기가 맑았다.\n';
  await writeFile(inputPath, input, 'utf8');
  await writeFile(finalPath, input, 'utf8');

  try {
    // When
    const prepare = spawnSync(
      'python3',
      [
        new URL('scripts/prepare_monolith_input.py', PLUGIN_ROOT).pathname,
        '--run-dir',
        runDirectory,
        '--genre',
        'essay',
      ],
      { encoding: 'utf8' },
    );
    const gate = spawnSync(
      'python3',
      [
        new URL('scripts/verify_gates.py', PLUGIN_ROOT).pathname,
        '--before',
        inputPath,
        '--after',
        finalPath,
        '--genre',
        'essay',
      ],
      { encoding: 'utf8' },
    );
    // Then
    assert.equal(prepare.status, 0, prepare.stderr);
    assert.match(prepare.stdout, /degraded=False/, 'prepare shim silently degraded');
    const metrics = JSON.parse(await readFile(join(runDirectory, '00_metrics.json'), 'utf8'));
    assert.ok(metrics.route_hint, 'prepare shim silently degraded without a route_hint');
    assert.equal(gate.status, 0, gate.stderr || gate.stdout);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
