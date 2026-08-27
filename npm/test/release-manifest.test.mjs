import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  generateReleaseManifest,
  gitTreeSha256,
  ReleaseManifestError,
  RUNTIME_PATH,
} from '../scripts/release-manifest-core.mjs';

const PACKAGE_NAME = '@nunch-dev/skills';

function git(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
}

async function writeFixtureFile(root, path, content) {
  const destination = join(root, path);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, content);
}

async function releaseFixture(context, { largeRuntime = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nunch-skills-release-manifest-'));
  const repository = join(root, 'repository');
  const staging = join(root, 'staging');
  await mkdir(repository);
  await mkdir(staging);
  context.after(() => rm(root, { recursive: true, force: true }));

  const packageFiles = [
    'README.md',
    'npm/bin/nunch-skills.mjs',
    '.agents/plugins/marketplace.json',
    'plugins/nch-installer/.codex-plugin/plugin.json',
    'plugins/nch-installer/hooks/hooks.json',
    'plugins/nch-installer/scripts/node-dispatch.ps1',
    RUNTIME_PATH,
  ];
  const packageJSON = `${JSON.stringify({ name: PACKAGE_NAME, version: '1.2.3', files: packageFiles })}\n`;
  await writeFixtureFile(repository, 'package.json', packageJSON);
  await writeFixtureFile(staging, 'package.json', packageJSON);
  for (const path of packageFiles) {
    const content = largeRuntime && path === RUNTIME_PATH ? Buffer.alloc(2 * 1024 * 1024, 0x5a) : `fixture ${path}\n`;
    await writeFixtureFile(repository, path, content);
    await writeFixtureFile(staging, path, content);
  }
  const marketplace = `${JSON.stringify({
    name: 'nunch-skills',
    plugins: [
      { name: 'git-tools', source: { source: 'local', path: './plugins/git-tools' } },
      { name: 'nch-installer', source: { source: 'local', path: './plugins/nch-installer' } },
    ],
  })}\n`;
  await writeFixtureFile(repository, '.agents/plugins/marketplace.json', marketplace);
  await writeFixtureFile(staging, '.agents/plugins/marketplace.json', marketplace);
  await writeFixtureFile(
    repository,
    'plugins/git-tools/.codex-plugin/plugin.json',
    '{"name":"git-tools","version":"0.2.1"}\n',
  );
  await writeFixtureFile(
    repository,
    'plugins/nch-installer/.codex-plugin/plugin.json',
    '{"name":"nch-installer","version":"1.2.3"}\n',
  );
  await writeFixtureFile(
    staging,
    'plugins/nch-installer/.codex-plugin/plugin.json',
    '{"name":"nch-installer","version":"1.2.3"}\n',
  );
  await writeFixtureFile(repository, 'plugins/nch-installer/hooks/hooks.json', 'hook\n');
  await writeFixtureFile(staging, 'plugins/nch-installer/hooks/hooks.json', 'hook\n');
  await writeFixtureFile(repository, 'plugins/nch-installer/scripts/node-dispatch.ps1', 'powershell\n');
  await writeFixtureFile(staging, 'plugins/nch-installer/scripts/node-dispatch.ps1', 'powershell\n');

  git(repository, ['init', '--quiet']);
  git(repository, ['config', 'user.name', 'Release Test']);
  git(repository, ['config', 'user.email', 'release@example.test']);
  git(repository, ['add', '.']);
  git(repository, ['commit', '--quiet', '-m', 'release fixture']);
  const commit = git(repository, ['rev-parse', 'HEAD']);
  git(repository, ['tag', 'v1.2.3']);
  return { commit, repo: repository, repository, staging };
}

test('release manifest reads a multi-megabyte TypeScript runtime from the pinned commit', async (context) => {
  // Given
  const fixture = await releaseFixture(context, { largeRuntime: true });

  // When
  const result = await generateReleaseManifest({ ...fixture, tag: 'v1.2.3', dryRun: true });

  // Then
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(result.manifest.runtime.path, RUNTIME_PATH);
});

test('release manifest is deterministic and generated outside the pinned Git tree', async (context) => {
  // Given
  const fixture = await releaseFixture(context);

  // When
  const first = await generateReleaseManifest({ ...fixture, tag: 'v1.2.3', dryRun: false });
  const second = await generateReleaseManifest({ ...fixture, tag: 'v1.2.3', dryRun: true });

  // Then
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.manifest.npm.name, PACKAGE_NAME);
  assert.equal(first.manifest.git.commit, fixture.commit);
  assert.equal(first.manifest.git.tag, 'v1.2.3');
  assert.equal(first.manifest.runtime.path, RUNTIME_PATH);
  assert.deepEqual(first.manifest.plugins, [
    { name: 'git-tools', version: '0.2.1' },
    { name: 'nch-installer', version: '1.2.3' },
  ]);
  assert.equal(git(fixture.repository, ['ls-tree', '--name-only', 'HEAD', 'release-manifest.json']), '');
  assert.deepEqual(await readFile(first.output), first.bytes);
});

test('release manifest rejects staging content that differs from the pinned commit', async (context) => {
  // Given
  const fixture = await releaseFixture(context);
  await writeFile(join(fixture.staging, RUNTIME_PATH), 'tampered\n');

  // When / Then
  await assert.rejects(
    generateReleaseManifest({ ...fixture, tag: 'v1.2.3', dryRun: false }),
    (error) => error instanceof ReleaseManifestError && error.message.includes('staging file differs'),
  );
});

test('release manifest rejects dirty repositories before writing an artifact', async (context) => {
  // Given
  const fixture = await releaseFixture(context);
  await writeFixtureFile(fixture.repository, 'unexpected.txt', 'dirty\n');

  // When / Then
  await assert.rejects(
    generateReleaseManifest({ ...fixture, tag: 'v1.2.3', dryRun: false }),
    (error) => error instanceof ReleaseManifestError && error.message.includes('clean worktree'),
  );
});

test('release manifest rejects a tag that does not match the package version', async (context) => {
  // Given
  const fixture = await releaseFixture(context);
  git(fixture.repository, ['tag', 'v9.9.9']);

  // When / Then
  await assert.rejects(
    generateReleaseManifest({ ...fixture, tag: 'v9.9.9', dryRun: false }),
    (error) => error instanceof ReleaseManifestError && error.message.includes('match package version'),
  );
});

test('Git tree digest frames paths and contents without an ambiguous separator', () => {
  // Given
  const first = new Map([['a', Buffer.from('bc')]]);
  const second = new Map([['ab', Buffer.from('c')]]);

  // When
  const firstDigest = gitTreeSha256(first);
  const secondDigest = gitTreeSha256(second);

  // Then
  assert.notEqual(firstDigest, secondDigest);
});
