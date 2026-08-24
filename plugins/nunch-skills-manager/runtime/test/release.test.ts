import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { inspectTarball } from '../src/release.ts';
import { authenticateReleaseManifest, type ReleaseManifest, verifyCandidateLayout } from '../src/release-manifest.ts';

test('verifies npm and Git protected files before candidate execution', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'release-candidate-'));
  const packageRoot = join(root, 'package');
  const gitRoot = join(root, 'git');
  const runtime = 'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs';
  const content = 'runtime\n';
  const packageJson = `${JSON.stringify({ name: '@nunch-dev/skills', version: '1.2.3', files: [runtime] })}\n`;
  await write(packageRoot, 'package.json', packageJson);
  await write(gitRoot, 'package.json', packageJson);
  await write(packageRoot, runtime, content);
  await write(gitRoot, runtime, content);
  const digest = createHash('sha256').update(content).digest('hex');
  const packageDigest = createHash('sha256').update(packageJson).digest('hex');
  const manifest = {
    schemaVersion: 2,
    npm: {
      name: '@nunch-dev/skills',
      version: '1.2.3',
      files: [
        { path: 'package.json', sha256: packageDigest },
        { path: runtime, sha256: digest },
      ],
    },
    git: { tag: 'v1.2.3', commit: 'a'.repeat(40), contentSha256: 'b'.repeat(64) },
    runtime: { path: runtime, sha256: digest },
    marketplace: { path: '.agents/plugins/marketplace.json', sha256: 'c'.repeat(64) },
    plugin: { path: 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', sha256: 'd'.repeat(64) },
    hook: { path: 'plugins/nunch-skills-manager/hooks/hooks.json', sha256: 'e'.repeat(64) },
    scripts: [],
    plugins: [{ name: 'nunch-skills-manager', version: '1.2.3' }],
  };

  // When / Then
  await assert.doesNotReject(() =>
    verifyCandidateLayout(packageRoot, gitRoot, manifest, { verifyAllProtected: false }),
  );
  await writeFile(join(packageRoot, runtime), 'tampered\n');
  await assert.rejects(
    () => verifyCandidateLayout(packageRoot, gitRoot, manifest, { verifyAllProtected: false }),
    /digest/,
  );
});

test('rejects a launcher omitted from the self-declared npm file list', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'release-candidate-'));
  const packageRoot = join(root, 'package');
  const gitRoot = join(root, 'git');
  const runtime = 'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs';
  const launcher = 'npm/bin/nunch-skills.mjs';
  const packageJson = `${JSON.stringify({ name: '@nunch-dev/skills', version: '1.2.3', files: [launcher, runtime] })}\n`;
  await write(packageRoot, 'package.json', packageJson);
  await write(gitRoot, 'package.json', packageJson);
  await write(packageRoot, runtime, 'runtime\n');
  await write(gitRoot, runtime, 'runtime\n');
  await write(packageRoot, launcher, 'malicious launcher\n');
  const digest = createHash('sha256').update('runtime\n').digest('hex');
  const manifest = {
    schemaVersion: 2,
    npm: { name: '@nunch-dev/skills', version: '1.2.3', files: [{ path: runtime, sha256: digest }] },
    git: { tag: 'v1.2.3', commit: 'a'.repeat(40), contentSha256: 'b'.repeat(64) },
    runtime: { path: runtime, sha256: digest },
    marketplace: { path: '.agents/plugins/marketplace.json', sha256: 'c'.repeat(64) },
    plugin: { path: 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', sha256: 'd'.repeat(64) },
    hook: { path: 'plugins/nunch-skills-manager/hooks/hooks.json', sha256: 'e'.repeat(64) },
    scripts: [],
    plugins: [{ name: 'nunch-skills-manager', version: '1.2.3' }],
  };

  // When / Then
  await assert.rejects(
    () => verifyCandidateLayout(packageRoot, gitRoot, manifest, { verifyAllProtected: false }),
    /npm package surface/,
  );
});

test('authenticates the npm manifest against the complete Git release', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'release-auth-'));
  const repository = join(root, 'repository');
  const staging = join(root, 'staging');
  await mkdir(repository);
  await mkdir(staging);
  const packageFiles = [
    '.agents/plugins/marketplace.json',
    'npm/bin/nunch-skills.mjs',
    'plugins/nunch-skills-manager/.codex-plugin/plugin.json',
    'plugins/nunch-skills-manager/hooks/hooks.json',
    'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs',
    'plugins/nunch-skills-manager/scripts/node-dispatch.ps1',
  ];
  const packageJson = `${JSON.stringify({ name: '@nunch-dev/skills', version: '1.2.3', files: packageFiles })}\n`;
  await write(repository, 'package.json', packageJson);
  await write(staging, 'package.json', packageJson);
  for (const path of packageFiles) {
    await write(repository, path, `${path}\n`);
    await write(staging, path, `${path}\n`);
  }
  const marketplace = `${JSON.stringify({
    name: 'nunch-skills',
    plugins: [{ name: 'nunch-skills-manager', source: { source: 'local', path: './plugins/nunch-skills-manager' } }],
  })}\n`;
  await write(repository, '.agents/plugins/marketplace.json', marketplace);
  await write(staging, '.agents/plugins/marketplace.json', marketplace);
  const pluginManifest = '{"name":"nunch-skills-manager","version":"1.2.3"}\n';
  await write(repository, 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', pluginManifest);
  await write(staging, 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', pluginManifest);
  git(repository, ['init', '--quiet']);
  git(repository, ['config', 'user.name', 'Release Test']);
  git(repository, ['config', 'user.email', 'release@example.test']);
  git(repository, ['add', '.']);
  git(repository, ['commit', '--quiet', '-m', 'release fixture']);
  const commit = git(repository, ['rev-parse', 'HEAD']);
  git(repository, ['tag', 'v1.2.3']);
  const script = new URL('../../../../npm/scripts/release-manifest.mjs', import.meta.url);
  const raw = execFileSync(
    process.execPath,
    [script.pathname, '--repo', repository, '--staging', staging, '--commit', commit, '--tag', 'v1.2.3', '--dry-run'],
    { encoding: 'utf8' },
  );
  const manifest = JSON.parse(raw);

  // When / Then
  await assert.doesNotReject(() => authenticateReleaseManifest(repository, manifest));
  manifest.npm.files = manifest.npm.files.filter((file: { path: string }) => file.path !== 'npm/bin/nunch-skills.mjs');
  await assert.rejects(() => authenticateReleaseManifest(repository, manifest), /differs/);
});

test('rejects symlinks in an npm update archive', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'release-archive-'));
  const packageRoot = join(root, 'package');
  await mkdir(join(packageRoot, 'npm', 'bin'), { recursive: true });
  await writeFile(join(packageRoot, 'release-manifest.json'), '{}\n');
  await symlink('../../../outside', join(packageRoot, 'npm', 'bin', 'nunch-skills.mjs'));
  const archive = join(root, 'candidate.tgz');
  execFileSync('tar', ['-czf', archive, 'package'], { cwd: root });
  const manifest: ReleaseManifest = {
    schemaVersion: 2,
    npm: {
      name: '@nunch-dev/skills',
      version: '1.2.3',
      files: [{ path: 'npm/bin/nunch-skills.mjs', sha256: 'a'.repeat(64) }],
    },
    git: { tag: 'v1.2.3', commit: 'b'.repeat(40), contentSha256: 'c'.repeat(64) },
    plugins: [{ name: 'nunch-skills-manager', version: '1.2.3' }],
    marketplace: { path: '.agents/plugins/marketplace.json', sha256: 'd'.repeat(64) },
    plugin: { path: 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', sha256: 'e'.repeat(64) },
    hook: { path: 'plugins/nunch-skills-manager/hooks/hooks.json', sha256: 'f'.repeat(64) },
    scripts: [],
    runtime: {
      path: 'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs',
      sha256: '0'.repeat(64),
    },
  };

  // When / Then
  await assert.rejects(() => inspectTarball(archive, manifest), /unsafe path/);
});

async function write(root: string, relative: string, content: string): Promise<void> {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}
