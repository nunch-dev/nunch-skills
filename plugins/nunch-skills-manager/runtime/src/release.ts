import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { execCommand } from './command.ts';
import {
  authenticateReleaseManifest,
  parseReleaseManifest,
  type ReleaseManifest,
  ReleaseVerificationError,
  verifyCandidateLayout,
} from './release-manifest.ts';
import { isStrictStableUpgrade } from './update-policy.ts';

const execFileAsync = promisify(execFile);

export async function runVerifiedUpdate(currentVersion: string): Promise<'updated' | 'up-to-date'> {
  const temporary = await mkdtemp(join(tmpdir(), 'nunch-skills-update-'));
  try {
    const pack = await execCommand(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary, '@nunch-dev/skills@latest'],
      { timeout: 120_000 },
    );
    const packageFile = parsePackFilename(pack.stdout);
    const archive = join(temporary, packageFile);
    const manifestBytes = await execFileAsync('tar', ['-xOzf', archive, 'package/release-manifest.json'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    const parsed = parseReleaseManifest(JSON.parse(manifestBytes.stdout));
    if (!isStrictStableUpgrade(currentVersion, parsed.npm.version)) return 'up-to-date';
    const gitRoot = join(temporary, 'git');
    await execFileAsync(
      'git',
      [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        parsed.git.tag,
        'https://github.com/nunch-dev/nunch-skills.git',
        gitRoot,
      ],
      { timeout: 120_000 },
    );
    const head = (await execFileAsync('git', ['-C', gitRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
    if (head !== parsed.git.commit) throw new ReleaseVerificationError('Git tag commit differs from manifest');
    await authenticateReleaseManifest(gitRoot, parsed);
    await inspectTarball(archive, parsed);
    await execFileAsync('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', temporary]);
    const packageRoot = join(temporary, 'package');
    await verifyCandidateLayout(packageRoot, gitRoot, parsed);
    const result = await execFileAsync(process.execPath, [join(packageRoot, 'npm/bin/nunch-skills.mjs')], {
      env: {
        ...process.env,
        NUNCH_SKILLS_INTERNAL_OPERATION: 'update',
        NUNCH_SKILLS_RELEASE_COMMIT: parsed.git.commit,
      },
      timeout: 120_000,
    });
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    return 'updated';
  } catch (error) {
    throw new ReleaseVerificationError('verified update failed', { cause: error });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyPackagedRelease(packageRoot: string): Promise<ReleaseManifest | undefined> {
  try {
    await access(join(packageRoot, 'release-manifest.json'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
  const manifest: unknown = JSON.parse(await readFile(join(packageRoot, 'release-manifest.json'), 'utf8'));
  const parsed = parseReleaseManifest(manifest);
  const temporary = await mkdtemp(join(tmpdir(), 'nunch-skills-current-release-'));
  try {
    const gitRoot = join(temporary, 'git');
    await execFileAsync(
      'git',
      [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        parsed.git.tag,
        'https://github.com/nunch-dev/nunch-skills.git',
        gitRoot,
      ],
      { timeout: 120_000 },
    );
    const head = (await execFileAsync('git', ['-C', gitRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
    if (head !== parsed.git.commit) throw new ReleaseVerificationError('packaged Git identity mismatch');
    await authenticateReleaseManifest(gitRoot, parsed);
    await verifyCandidateLayout(packageRoot, gitRoot, parsed);
    return parsed;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parsePackFilename(raw: string): string {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new ReleaseVerificationError('npm pack output is invalid');
  const item = parsed[0];
  if (typeof item !== 'object' || item === null || !('filename' in item) || typeof item.filename !== 'string') {
    throw new ReleaseVerificationError('npm pack filename is missing');
  }
  return item.filename;
}

export async function inspectTarball(path: string, manifest: ReleaseManifest): Promise<void> {
  const listing = await execFileAsync('tar', ['-tvzf', path], { encoding: 'utf8', timeout: 30_000 });
  const lines = listing.stdout.split('\n').filter((line) => line.length > 0);
  if (lines.length > 10_000) throw new ReleaseVerificationError('npm tarball has too many entries');
  const expected = new Set([
    'package/release-manifest.json',
    ...manifest.npm.files.map((file) => `package/${file.path}`),
  ]);
  const expectedDirectories = new Set<string>(['package/']);
  for (const entry of expected) {
    const parts = entry.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      expectedDirectories.add(`${parts.slice(0, index).join('/')}/`);
    }
  }
  const found = new Set<string>();
  let totalSize = 0;
  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    const entry = fields.at(-1);
    const size = Number(fields[2]);
    if (
      entry === undefined ||
      !entry.startsWith('package/') ||
      entry.includes('../') ||
      entry.includes('\\') ||
      (line[0] !== '-' && line[0] !== 'd') ||
      (line[0] === '-' && !expected.has(entry)) ||
      (line[0] === 'd' && !expectedDirectories.has(entry))
    ) {
      throw new ReleaseVerificationError('npm tarball contains an unsafe path');
    }
    if (line[0] === '-') {
      if (found.has(entry)) throw new ReleaseVerificationError('npm tarball contains a duplicate file');
      found.add(entry);
    }
    if (Number.isFinite(size)) totalSize += size;
  }
  if (found.size !== expected.size || [...expected].some((entry) => !found.has(entry))) {
    throw new ReleaseVerificationError('npm tarball differs from the authenticated package surface');
  }
  if (totalSize > 100 * 1024 * 1024) throw new ReleaseVerificationError('npm tarball expands beyond the limit');
  totalSize = 0;
  for (const file of manifest.npm.files) {
    const extracted = await execFileAsync('tar', ['-xOzf', path, `package/${file.path}`], {
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024 + 1,
      timeout: 30_000,
    });
    const content = Buffer.from(extracted.stdout);
    totalSize += content.length;
    if (createHash('sha256').update(content).digest('hex') !== file.sha256) {
      throw new ReleaseVerificationError(`npm archive digest mismatch: ${file.path}`);
    }
  }
  if (totalSize > 100 * 1024 * 1024) throw new ReleaseVerificationError('npm tarball expands beyond the limit');
}
