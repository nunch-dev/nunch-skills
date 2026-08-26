import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inspectTarball } from '../src/release.ts';
import type { ReleaseManifest } from '../src/release-manifest.ts';

test('validates and extracts an update archive with the platform tar executable', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'release-tar-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, 'package');
  const file = 'npm/bin/nunch-skills.mjs';
  const content = 'launcher\n';
  await mkdir(join(packageRoot, 'npm', 'bin'), { recursive: true });
  await writeFile(join(packageRoot, 'release-manifest.json'), '{}\n');
  await writeFile(join(packageRoot, file), content);
  const archive = join(root, 'candidate.tgz');
  execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
  const manifest: ReleaseManifest = {
    schemaVersion: 2,
    npm: {
      name: '@nunch-dev/skills',
      version: '1.2.3',
      files: [{ path: file, sha256: createHash('sha256').update(content).digest('hex') }],
    },
    git: { tag: 'v1.2.3', commit: 'a'.repeat(40), contentSha256: 'b'.repeat(64) },
    plugins: [{ name: 'nunch-skills-manager', version: '1.2.3' }],
    marketplace: { path: '.agents/plugins/marketplace.json', sha256: 'c'.repeat(64) },
    plugin: { path: 'plugins/nunch-skills-manager/.codex-plugin/plugin.json', sha256: 'd'.repeat(64) },
    hook: { path: 'plugins/nunch-skills-manager/hooks/hooks.json', sha256: 'e'.repeat(64) },
    scripts: [],
    runtime: {
      path: 'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs',
      sha256: 'f'.repeat(64),
    },
  };

  await inspectTarball(archive, manifest);
  const extractionRoot = join(root, 'extracted');
  await mkdir(extractionRoot);
  execFileSync('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', extractionRoot]);

  assert.equal(await readFile(join(extractionRoot, 'package', file), 'utf8'), content);
});
