import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import packageManifest from '../../package.json' with { type: 'json' };
import { verifyPackagedRelease } from '../../plugins/nunch-skills/runtime/src/release.ts';
import type { ReleaseManifest } from '../../plugins/nunch-skills/runtime/src/release-manifest.ts';

const execFileAsync = promisify(execFile);

export const cliVersion = z.object({ version: z.string() }).parse(packageManifest).version;

export function codexHomePath(): string {
  return process.env['CODEX_HOME'] ?? join(homedir(), '.codex');
}

export function claudeHomePath(): string {
  return process.env['CLAUDE_HOME'] ?? join(homedir(), '.claude');
}

type ResolvedRelease = { commit: string; manifest?: ReleaseManifest };

export async function resolveRelease(): Promise<ResolvedRelease> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const verified = await verifyPackagedRelease(packageRoot);
  if (verified !== undefined) return { commit: verified.git.commit, manifest: verified };
  const configured = process.env['NUNCH_SKILLS_RELEASE_COMMIT'];
  if (configured !== undefined && /^[0-9a-f]{40}$/.test(configured)) return { commit: configured };
  try {
    const raw: unknown = JSON.parse(
      await import('node:fs/promises').then(({ readFile }) =>
        readFile(join(packageRoot, 'release-manifest.json'), 'utf8'),
      ),
    );
    if (typeof raw === 'object' && raw !== null && 'git' in raw) {
      const git = raw.git;
      if (
        typeof git === 'object' &&
        git !== null &&
        'commit' in git &&
        typeof git.commit === 'string' &&
        /^[0-9a-f]{40}$/.test(git.commit)
      ) {
        return { commit: git.commit };
      }
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: packageRoot });
  return { commit: result.stdout.trim() };
}
