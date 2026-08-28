import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const execFileAsync = promisify(execFile);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const fileSchema = z.strictObject({ path: z.string().min(1), sha256: digestSchema });
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(2),
  npm: z.strictObject({
    name: z.literal('@nunch-dev/skills'),
    version: z.string(),
    files: z.array(fileSchema),
  }),
  git: z.strictObject({ tag: z.string(), commit: commitSchema, contentSha256: digestSchema }),
  plugins: z.array(z.strictObject({ name: z.string(), version: z.string() })),
  marketplace: fileSchema,
  plugin: fileSchema,
  hook: fileSchema,
  scripts: z.array(fileSchema),
  runtime: fileSchema,
});
const packageSchema = z.object({
  name: z.literal('@nunch-dev/skills'),
  version: z.string(),
  files: z.array(z.string()),
});
const marketplaceSchema = z.object({
  plugins: z.array(
    z.object({
      name: z.string(),
      source: z.object({ source: z.literal('local'), path: z.string() }),
    }),
  ),
});
const pluginManifestSchema = z.object({ name: z.string(), version: z.string() });

const marketplacePath = '.agents/plugins/marketplace.json';
const pluginPath = 'plugins/nunch-skills/.codex-plugin/plugin.json';
const hookPath = 'plugins/nunch-skills/hooks/hooks.json';
const runtimePath = 'plugins/nunch-skills/runtime/nch-installer.mjs';
const scriptPaths = [
  'plugins/nunch-skills/hooks/i-have-adhd-always-on.mjs',
  'plugins/nunch-skills/scripts/node-dispatch.ps1',
];

export type ReleaseManifest = z.infer<typeof manifestSchema>;
type ReleaseFile = z.infer<typeof fileSchema>;
type VerifyOptions = { verifyAllProtected: boolean };

export class ReleaseVerificationError extends Error {
  name = 'ReleaseVerificationError';
}

export function parseReleaseManifest(input: unknown): ReleaseManifest {
  return manifestSchema.parse(input);
}

export async function authenticateReleaseManifest(gitRoot: string, input: unknown): Promise<ReleaseManifest> {
  const manifest = parseReleaseManifest(input);
  const head = await execFileAsync('git', ['-C', gitRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (head.stdout.trim() !== manifest.git.commit) {
    throw new ReleaseVerificationError('release commit differs from the verified Git checkout');
  }
  const files = await readGitTree(gitRoot);
  const packageManifest = packageSchema.parse(JSON.parse(required(files, 'package.json').toString('utf8')));
  if (manifest.git.tag !== `v${packageManifest.version}` || manifest.npm.version !== packageManifest.version) {
    throw new ReleaseVerificationError('release version differs from the verified Git release');
  }
  const packagePaths = [
    'package.json',
    ...packageManifest.files.filter((path) => path !== 'release-manifest.json'),
  ].sort();
  assertSafeUniquePaths(packagePaths);
  const npmFiles = packagePaths.map((path) => releaseFile(path, required(files, path)));
  const plugins = pluginCatalog(files);
  const expected: ReleaseManifest = {
    schemaVersion: 2,
    npm: { name: '@nunch-dev/skills', version: packageManifest.version, files: npmFiles },
    git: {
      tag: `v${packageManifest.version}`,
      commit: manifest.git.commit,
      contentSha256: gitTreeDigest(files),
    },
    plugins,
    marketplace: releaseFile(marketplacePath, required(files, marketplacePath)),
    plugin: releaseFile(pluginPath, required(files, pluginPath)),
    hook: releaseFile(hookPath, required(files, hookPath)),
    scripts: scriptPaths.map((path) => releaseFile(path, required(files, path))),
    runtime: releaseFile(runtimePath, required(files, runtimePath)),
  };
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new ReleaseVerificationError('release manifest differs from the verified Git release');
  }
  return manifest;
}

export async function verifyCandidateLayout(
  packageRoot: string,
  gitRoot: string,
  input: unknown,
  options: VerifyOptions = { verifyAllProtected: true },
): Promise<ReleaseManifest> {
  const manifest = parseReleaseManifest(input);
  await verifyNpmSurface(gitRoot, manifest);
  for (const file of manifest.npm.files) await verifyFile(packageRoot, file);
  await verifyFile(gitRoot, manifest.runtime);
  if (options.verifyAllProtected) {
    for (const file of [manifest.marketplace, manifest.plugin, manifest.hook, ...manifest.scripts]) {
      await verifyFile(gitRoot, file);
    }
  }
  return manifest;
}

async function verifyFile(root: string, file: ReleaseFile): Promise<void> {
  if (!safePath(file.path)) throw new ReleaseVerificationError(`unsafe release path: ${file.path}`);
  const digest = sha256(await readFile(join(root, file.path)));
  if (digest !== file.sha256) throw new ReleaseVerificationError(`release digest mismatch: ${file.path}`);
}

async function verifyNpmSurface(gitRoot: string, manifest: ReleaseManifest): Promise<void> {
  const packageManifest = packageSchema.parse(JSON.parse(await readFile(join(gitRoot, 'package.json'), 'utf8')));
  const expectedPaths = [
    'package.json',
    ...packageManifest.files.filter((path) => path !== 'release-manifest.json'),
  ].sort();
  const actualPaths = manifest.npm.files.map((file) => file.path).sort();
  if (
    packageManifest.version !== manifest.npm.version ||
    expectedPaths.length !== actualPaths.length ||
    expectedPaths.some((path, index) => path !== actualPaths[index])
  ) {
    throw new ReleaseVerificationError('npm package surface differs from the verified Git release');
  }
  for (const file of manifest.npm.files) await verifyFile(gitRoot, file);
}

async function readGitTree(root: string): Promise<Map<string, Buffer>> {
  const listing = await execFileAsync('git', ['-C', root, 'ls-tree', '-r', '-z', '--name-only', 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const paths = listing.stdout.split('\0').filter((path) => path.length > 0);
  assertSafeUniquePaths(paths);
  const files = new Map<string, Buffer>();
  for (const path of paths) {
    const result = await execFileAsync('git', ['-C', root, 'show', `HEAD:${path}`], {
      encoding: 'buffer',
      maxBuffer: 128 * 1024 * 1024,
    });
    files.set(path, Buffer.from(result.stdout));
  }
  return files;
}

function pluginCatalog(files: Map<string, Buffer>): { name: string; version: string }[] {
  const marketplace = marketplaceSchema.parse(JSON.parse(required(files, marketplacePath).toString('utf8')));
  const plugins = marketplace.plugins.map((entry) => {
    if (!entry.source.path.startsWith('./plugins/')) {
      throw new ReleaseVerificationError('marketplace plugin path is invalid');
    }
    const path = `${entry.source.path.slice(2)}/.codex-plugin/plugin.json`;
    const plugin = pluginManifestSchema.parse(JSON.parse(required(files, path).toString('utf8')));
    if (plugin.name !== entry.name) throw new ReleaseVerificationError('marketplace plugin identity differs');
    return { name: plugin.name, version: plugin.version };
  });
  plugins.sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(plugins.map((plugin) => plugin.name)).size !== plugins.length) {
    throw new ReleaseVerificationError('marketplace plugin names are duplicated');
  }
  return plugins;
}

function gitTreeDigest(files: Map<string, Buffer>): string {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    const pathBytes = Buffer.from(path);
    const content = required(files, path);
    const frame = Buffer.alloc(8);
    frame.writeBigUInt64BE(BigInt(pathBytes.length));
    hash.update(frame);
    hash.update(pathBytes);
    frame.writeBigUInt64BE(BigInt(content.length));
    hash.update(frame);
    hash.update(content);
  }
  return hash.digest('hex');
}

function releaseFile(path: string, content: Buffer): ReleaseFile {
  return { path, sha256: sha256(content) };
}

function required(files: Map<string, Buffer>, path: string): Buffer {
  const content = files.get(path);
  if (content === undefined) throw new ReleaseVerificationError(`verified Git release is missing ${path}`);
  return content;
}

function assertSafeUniquePaths(paths: string[]): void {
  if (new Set(paths).size !== paths.length || paths.some((path) => !safePath(path))) {
    throw new ReleaseVerificationError('release paths are unsafe or duplicated');
  }
}

function safePath(path: string): boolean {
  const cleaned = normalize(path);
  return (
    path.length > 0 && !path.includes('\\') && !isAbsolute(path) && cleaned !== '..' && !cleaned.startsWith(`..${sep}`)
  );
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
