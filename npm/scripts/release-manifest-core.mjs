#!/usr/bin/env node

import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import { gitTree, runGit } from './release-manifest-git.mjs';
import {
  COMMIT_PATTERN,
  gitTreeSha256,
  isSafeRelativePath,
  MANIFEST_PATH,
  ReleaseManifestError,
  SEMVER_PATTERN,
  sha256,
} from './release-manifest-model.mjs';

const PACKAGE_NAME = '@nunch-dev/skills';
const MARKETPLACE_PATH = '.agents/plugins/marketplace.json';
const PLUGIN_PATH = 'plugins/nunch-skills-manager/.codex-plugin/plugin.json';
const HOOK_PATH = 'plugins/nunch-skills-manager/hooks/hooks.json';
const SCRIPT_PATHS = ['plugins/nunch-skills-manager/scripts/node-dispatch.ps1'];
const RUNTIME_PATH = 'plugins/nunch-skills-manager/runtime/nunch-skills-manager.mjs';

async function readStageFile(staging, path) {
  if (!isSafeRelativePath(path)) {
    throw new ReleaseManifestError(`unsafe staging path: ${path}`);
  }
  const location = resolve(staging, path);
  if (relative(staging, location).startsWith('..')) {
    throw new ReleaseManifestError(`staging path escapes root: ${path}`);
  }
  try {
    return await readFile(location);
  } catch (error) {
    throw new ReleaseManifestError(`staging file is missing: ${path} (${error.message})`);
  }
}

function declaredPackageFiles(packageManifest) {
  if (packageManifest.name !== PACKAGE_NAME) {
    throw new ReleaseManifestError(`package name must be ${PACKAGE_NAME}`);
  }
  if (typeof packageManifest.version !== 'string' || !SEMVER_PATTERN.test(packageManifest.version)) {
    throw new ReleaseManifestError('package version must be SemVer');
  }
  if (
    !Array.isArray(packageManifest.files) ||
    packageManifest.files.some((value) => typeof value !== 'string' || !isSafeRelativePath(value))
  ) {
    throw new ReleaseManifestError('package files must contain safe relative paths');
  }
  const files = new Set(['package.json', ...packageManifest.files]);
  files.delete(MANIFEST_PATH);
  if (files.size !== packageManifest.files.length + 1 - Number(packageManifest.files.includes(MANIFEST_PATH))) {
    throw new ReleaseManifestError('package files contains duplicates');
  }
  return [...files].sort();
}

function releaseFile(path, content) {
  return { path, sha256: sha256(content) };
}

function pluginCatalog(gitFiles) {
  let marketplace;
  try {
    marketplace = JSON.parse(gitFiles.get(MARKETPLACE_PATH).toString('utf8'));
  } catch (error) {
    throw new ReleaseManifestError(`marketplace is invalid: ${error.message}`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    throw new ReleaseManifestError('marketplace plugins must be an array');
  }
  const plugins = marketplace.plugins
    .map((entry) => {
      const sourcePath = entry?.source?.path;
      if (typeof entry?.name !== 'string' || typeof sourcePath !== 'string' || !sourcePath.startsWith('./plugins/')) {
        throw new ReleaseManifestError('marketplace plugin identity is invalid');
      }
      const manifestPath = `${sourcePath.slice(2)}/.codex-plugin/plugin.json`;
      const manifestBytes = gitFiles.get(manifestPath);
      if (manifestBytes === undefined) {
        throw new ReleaseManifestError(`plugin manifest is missing: ${manifestPath}`);
      }
      let manifest;
      try {
        manifest = JSON.parse(manifestBytes.toString('utf8'));
      } catch (error) {
        throw new ReleaseManifestError(`plugin manifest is invalid: ${manifestPath} (${error.message})`);
      }
      if (
        manifest.name !== entry.name ||
        typeof manifest.version !== 'string' ||
        !SEMVER_PATTERN.test(manifest.version)
      ) {
        throw new ReleaseManifestError(`plugin manifest identity is invalid: ${manifestPath}`);
      }
      return { name: entry.name, version: manifest.version };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    new Set(plugins.map((plugin) => plugin.name)).size !== plugins.length ||
    !plugins.some((plugin) => plugin.name === 'nunch-skills-manager')
  ) {
    throw new ReleaseManifestError('plugin catalog must contain unique names and nunch-skills-manager');
  }
  return plugins;
}

async function verifyStageMatchesGit(staging, paths, gitFiles) {
  for (const path of paths) {
    const expected = gitFiles.get(path);
    if (expected === undefined) {
      throw new ReleaseManifestError(`release commit is missing package file: ${path}`);
    }
    const actual = await readStageFile(staging, path);
    if (!actual.equals(expected)) {
      throw new ReleaseManifestError(`staging file differs from release commit: ${path}`);
    }
  }
}

async function writeAtomically(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, data, { mode: 0o644 });
  await rename(temporary, path);
}

async function resolveDirectories(repoPath, stagingPath) {
  const repo = await realpath(repoPath);
  const staging = await realpath(stagingPath);
  if (repo === staging || !relative(repo, staging).startsWith('..')) {
    throw new ReleaseManifestError('staging directory must be outside the release repository');
  }
  return { repo, staging };
}

async function generateReleaseManifest(input) {
  if (!COMMIT_PATTERN.test(input.commit)) {
    throw new ReleaseManifestError('commit must be a full lowercase 40-character SHA-1');
  }
  if (typeof input.tag !== 'string' || !input.tag.startsWith('v') || !SEMVER_PATTERN.test(input.tag.slice(1))) {
    throw new ReleaseManifestError('tag must use the vX.Y.Z SemVer form');
  }
  const { repo, staging } = await resolveDirectories(input.repo, input.staging);
  const resolvedCommit = runGit(repo, ['rev-parse', '--verify', `${input.commit}^{commit}`]).trim();
  if (resolvedCommit !== input.commit) {
    throw new ReleaseManifestError('commit must resolve to the supplied full SHA-1');
  }
  const head = runGit(repo, ['rev-parse', 'HEAD']).trim();
  if (head !== input.commit) {
    throw new ReleaseManifestError('repository HEAD must equal the release commit');
  }
  if (runGit(repo, ['status', '--porcelain', '--untracked-files=all']).trim() !== '') {
    throw new ReleaseManifestError('release repository must have a clean worktree');
  }
  const tagTarget = runGit(repo, ['rev-list', '-n', '1', input.tag]).trim();
  if (tagTarget !== input.commit) {
    throw new ReleaseManifestError('release tag must resolve to the release commit');
  }

  const gitFiles = gitTree(repo, input.commit);
  if (gitFiles.has(MANIFEST_PATH)) {
    throw new ReleaseManifestError('release manifest must not be committed to the release tree');
  }
  const packageBytes = gitFiles.get('package.json');
  if (packageBytes === undefined) {
    throw new ReleaseManifestError('release commit is missing package.json');
  }
  let packageManifest;
  try {
    packageManifest = JSON.parse(packageBytes.toString('utf8'));
  } catch (error) {
    throw new ReleaseManifestError(`package.json is invalid: ${error.message}`);
  }
  const packageFiles = declaredPackageFiles(packageManifest);
  if (input.tag !== `v${packageManifest.version}`) {
    throw new ReleaseManifestError('release tag must match package version');
  }

  if (!packageFiles.includes(RUNTIME_PATH)) {
    throw new ReleaseManifestError(`package files is missing manager runtime: ${RUNTIME_PATH}`);
  }
  await verifyStageMatchesGit(staging, packageFiles, gitFiles);
  const npmFiles = packageFiles.map((path) => releaseFile(path, gitFiles.get(path)));
  const protectedFiles = [MARKETPLACE_PATH, PLUGIN_PATH, HOOK_PATH, RUNTIME_PATH, ...SCRIPT_PATHS];
  for (const path of protectedFiles) {
    if (!gitFiles.has(path)) {
      throw new ReleaseManifestError(`release commit is missing protected file: ${path}`);
    }
  }
  const manifest = {
    schemaVersion: 2,
    npm: {
      name: PACKAGE_NAME,
      version: packageManifest.version,
      files: npmFiles,
    },
    git: {
      tag: input.tag,
      commit: input.commit,
      contentSha256: gitTreeSha256(gitFiles),
    },
    plugins: pluginCatalog(gitFiles),
    marketplace: releaseFile(MARKETPLACE_PATH, gitFiles.get(MARKETPLACE_PATH)),
    plugin: releaseFile(PLUGIN_PATH, gitFiles.get(PLUGIN_PATH)),
    hook: releaseFile(HOOK_PATH, gitFiles.get(HOOK_PATH)),
    scripts: SCRIPT_PATHS.map((path) => releaseFile(path, gitFiles.get(path))),
    runtime: releaseFile(RUNTIME_PATH, gitFiles.get(RUNTIME_PATH)),
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  if (!input.dryRun) {
    await writeAtomically(resolve(staging, MANIFEST_PATH), bytes);
  }
  return { bytes, manifest, output: resolve(staging, MANIFEST_PATH) };
}

export { generateReleaseManifest, gitTreeSha256, MANIFEST_PATH, ReleaseManifestError, RUNTIME_PATH };
