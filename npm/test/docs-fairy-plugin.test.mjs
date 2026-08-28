import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN_ROOT = resolve(REPOSITORY_ROOT, 'plugins/nunch-skills');
const DOCS_SKILL_ROOT = resolve(PLUGIN_ROOT, 'skills/docs-fairy');
const SITE_SKILL_ROOT = resolve(PLUGIN_ROOT, 'skills/docs-fairy-site');
const DOCS_SITE_ROOT = resolve(REPOSITORY_ROOT, 'docs-site');

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
  const skillPath = resolve(DOCS_SKILL_ROOT, 'SKILL.md');
  const skill = await readFile(skillPath, 'utf8');

  for (const mode of ['GENERATE', 'RECORD', 'SYNC', 'AUDIT', 'IMPROVE']) {
    assert.ok(skill.includes(`| \`${mode}\` |`), `router is missing ${mode}`);
  }
  assert.doesNotMatch(skill, /\| `SITE` \|/);
  assert.match(skill, /\.\.\/docs-fairy-site\/SKILL\.md/);
  assert.match(skill, /references\/shared-policy\.md/);

  const siteSkill = await readFile(resolve(SITE_SKILL_ROOT, 'SKILL.md'), 'utf8');
  assert.match(siteSkill, /자연어 요청/);
  assert.match(siteSkill, /docs-fairy.*같은 turn/);
  assert.match(siteSkill, /한 요청에서 SITE workflow를 두 번 실행해서는 안 됩니다/);
  assert.match(siteSkill, /\.\.\/docs-fairy\/references\/shared-policy\.md/);

  for (const reference of ['site-common.md', 'site-deployment.md', 'site-starlight.md', 'site-vitepress.md']) {
    assert.ok(siteSkill.includes(`references/${reference}`), `SITE router is missing ${reference}`);
  }

  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const root of [DOCS_SKILL_ROOT, SITE_SKILL_ROOT]) {
    const referenceDirectory = resolve(root, 'references');
    const referenceFiles = (await readdir(referenceDirectory))
      .filter((name) => name.endsWith('.md'))
      .map((name) => resolve(referenceDirectory, name));
    const markdownFiles = [resolve(root, 'SKILL.md'), ...referenceFiles];
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
  }
});

test('docs-fairy SITE QA requires theme switching only when the site provides it', async () => {
  const siteReference = await readFile(resolve(SITE_SKILL_ROOT, 'references/site-common.md'), 'utf8');

  assert.match(siteReference, /사이트가 테마 전환 UI를 제공하면 해당 전환도 검증한다/);
  assert.doesNotMatch(siteReference, /검색 결과 진입, 테마 전환이 실제로 동작한다/);
});

test('docs-fairy SITE framework guides share the common contract and deployment route', async () => {
  for (const reference of ['site-starlight.md', 'site-vitepress.md']) {
    const guide = await readFile(resolve(SITE_SKILL_ROOT, 'references', reference), 'utf8');
    const localTargets = new Set(
      [...guide.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
        .map((match) => match[1].split('#', 1)[0])
        .filter((target) => target !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(target)),
    );

    assert.equal(localTargets.has('site-common.md'), true, `${reference} must load site-common.md`);
    assert.equal(localTargets.has('site-deployment.md'), true, `${reference} must route deployment work`);
  }
});

test('docs-fairy-site is discoverable from the published documentation navigation', async () => {
  const astroConfig = await readFile(resolve(DOCS_SITE_ROOT, 'astro.config.mjs'), 'utf8');
  const skillIndex = await readFile(resolve(DOCS_SITE_ROOT, 'src/content/docs/skills/index.md'), 'utf8');

  assert.match(astroConfig, /label: 'docs-fairy-site', slug: 'skills\/docs-fairy-site'/);
  assert.match(skillIndex, /\[`docs-fairy-site`\]\(\/skills\/docs-fairy-site\/\)/);
  assert.equal(await pathExists(resolve(DOCS_SITE_ROOT, 'src/content/docs/skills/docs-fairy-site.md')), true);
});

test('documentation eval suites preserve legacy assertions and classify every assertion', async () => {
  const smoke = await readJson(resolve(PLUGIN_ROOT, 'evals/smoke.json'));
  const manual = await readJson(resolve(PLUGIN_ROOT, 'evals/evals.json'));
  const site = await readJson(resolve(PLUGIN_ROOT, 'evals/docs-fairy-site.json'));
  const gitTools = await readJson(resolve(PLUGIN_ROOT, 'evals/git-tools.json'));
  const kaneo = await readJson(resolve(PLUGIN_ROOT, 'evals/kaneo-skills.json'));
  const fixtureRoot = resolve(PLUGIN_ROOT, 'evals', smoke.fixture);

  assert.equal(smoke.release_blocking, true);
  assert.deepEqual(smoke.platforms, ['codex', 'claude']);
  assert.equal(manual.release_blocking, false);
  assert.equal(manual.evals.length, 10);
  assert.equal(site.evals.length, 5);
  assert.equal(manual.evals.length + site.migrated_legacy_scenarios.length, 12);
  assert.equal(
    manual.evals.some((scenario) => 'files' in scenario),
    false,
  );
  assert.doesNotMatch(JSON.stringify(manual), /fixtures\/(tasklite|logship|palette)/);

  const suites = [smoke, manual, site, gitTools, kaneo];
  const assertions = suites.flatMap((suite) =>
    'evals' in suite ? suite.evals.flatMap((scenario) => scenario.assertions) : suite.assertions,
  );
  const stableIds = assertions.map((assertion) => assertion.stable_id);
  assert.equal(new Set(stableIds).size, stableIds.length, 'assertion stable IDs must be unique');
  for (const assertion of assertions) {
    assert.match(assertion.stable_id, /^(legacy|workflow|smoke)\./);
    assert.ok(['mandatory', 'baseline'].includes(assertion.classification));
    assert.match(assertion.text, /[가-힣]/);
  }

  const legacyAssertions = [...manual.evals, ...site.evals.filter(({ id }) => id < 100)].flatMap(
    (scenario) => scenario.assertions,
  );
  assert.equal(legacyAssertions.length, 71);

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
