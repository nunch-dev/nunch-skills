import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const PLUGIN_ROOT = new URL('../../plugins/nunch-skills/', import.meta.url);

const readJson = async (path) => JSON.parse(await readFile(new URL(path, REPOSITORY_ROOT), 'utf8'));

test('one nunch-skills plugin bundles every published skill', async () => {
  // Given
  const expectedSkills = [
    'deep-interview',
    'docs-fairy',
    'git-tools',
    'humanize',
    'humanize-korean',
    'humanize-redo',
    'i-have-adhd',
    'kaneo-skills',
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
