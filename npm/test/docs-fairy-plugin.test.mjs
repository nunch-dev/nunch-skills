import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN_ROOT = resolve(REPOSITORY_ROOT, 'plugins/nunch-skills');
const SKILL_ROOT = resolve(PLUGIN_ROOT, 'skills/docs-fairy');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('docs-fairy is published inside the shared plugin on both marketplaces', async () => {
  const codexManifest = await readJson(resolve(PLUGIN_ROOT, '.codex-plugin/plugin.json'));
  const claudeManifest = await readJson(resolve(PLUGIN_ROOT, '.claude-plugin/plugin.json'));
  const codexMarketplace = await readJson(resolve(REPOSITORY_ROOT, '.agents/plugins/marketplace.json'));
  const claudeMarketplace = await readJson(resolve(REPOSITORY_ROOT, '.claude-plugin/marketplace.json'));

  assert.equal(codexManifest.name, 'nunch-skills');
  assert.equal(claudeManifest.name, codexManifest.name);
  assert.equal(claudeManifest.version, codexManifest.version);
  assert.ok(codexManifest.interface.defaultPrompt.length <= 3);

  const codexEntry = codexMarketplace.plugins.find(({ name }) => name === 'nunch-skills');
  assert.deepEqual(codexEntry, {
    name: 'nunch-skills',
    source: { source: 'local', path: './plugins/nunch-skills' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  });

  const claudeEntry = claudeMarketplace.plugins.find(({ name }) => name === 'nunch-skills');
  assert.equal(claudeEntry.source, './plugins/nunch-skills');
  assert.equal(claudeEntry.version, claudeManifest.version);
});

test('docs-fairy router and local Markdown references resolve', async () => {
  const skillPath = resolve(SKILL_ROOT, 'SKILL.md');
  const referenceDirectory = resolve(SKILL_ROOT, 'references');
  const referenceFiles = (await readdir(referenceDirectory))
    .filter((name) => name.endsWith('.md'))
    .map((name) => resolve(referenceDirectory, name));
  const markdownFiles = [skillPath, ...referenceFiles];
  const skill = await readFile(skillPath, 'utf8');

  for (const mode of ['GENERATE', 'RECORD', 'SYNC', 'AUDIT', 'IMPROVE', 'SITE']) {
    assert.ok(skill.includes(`| \`${mode}\` |`), `router is missing ${mode}`);
  }

  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const sourcePath of markdownFiles) {
    const source = await readFile(sourcePath, 'utf8');
    for (const match of source.matchAll(linkPattern)) {
      const target = match[1].split('#', 1)[0];
      if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue;
      }
      const resolved = resolve(dirname(sourcePath), target);
      assert.equal(await pathExists(resolved), true, `${sourcePath} links to missing ${target}`);
    }
  }
});

test('docs-fairy release smoke has one real read-only fixture', async () => {
  const smoke = await readJson(resolve(PLUGIN_ROOT, 'evals/smoke.json'));
  const manual = await readJson(resolve(PLUGIN_ROOT, 'evals/evals.json'));
  const fixtureRoot = resolve(PLUGIN_ROOT, 'evals', smoke.fixture);

  assert.equal(smoke.release_blocking, true);
  assert.deepEqual(smoke.platforms, ['codex', 'claude']);
  assert.equal(manual.release_blocking, false);
  assert.equal(manual.evals.length, 12);
  assert.equal(
    manual.evals.some((scenario) => 'files' in scenario),
    false,
  );
  assert.doesNotMatch(JSON.stringify(manual), /fixtures\/(tasklite|logship|palette)/);

  for (const path of ['README.md', 'docs/getting-started.md', 'package.json', 'src/cli.js']) {
    assert.equal(await pathExists(resolve(fixtureRoot, path)), true, `missing smoke fixture ${path}`);
  }
});

test('docs-fairy local release gate is executable shell', async () => {
  const scriptPath = resolve(REPOSITORY_ROOT, 'scripts/qa-docs-fairy-smoke.sh');
  const script = await readFile(scriptPath, 'utf8');
  const scriptStat = await stat(scriptPath);
  assert.notEqual(scriptStat.mode & 0o111, 0, 'release gate must be executable');
  assert.match(script, /--tools "Skill,Read,Glob,Grep"/);
  assert.match(script, /--output-format stream-json/);
  assert.match(script, /\["docs-fairy", "nunch-skills:docs-fairy"\]\.includes\(block\.input\?\.skill\)/);
  assert.match(script, /event\.type === "assistant" && block\.type === "text"/);

  const syntax = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});
