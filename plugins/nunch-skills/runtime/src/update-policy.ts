import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { lifecycleStateSchema } from './state.ts';

const stableSemver = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
type InstalledVersionOrder = 'older' | 'same' | 'newer';

export async function installedReleaseVersion(codexHome: string): Promise<string> {
  try {
    const path = join(codexHome, 'plugins', 'data', 'nunch-skills', 'lifecycle.json');
    const state = lifecycleStateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    return state.lastKnownGood?.version ?? '0.0.0';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '0.0.0';
    throw error;
  }
}

export function isStrictStableUpgrade(current: string, candidate: string): boolean {
  const left = stableParts(current);
  const right = stableParts(candidate);
  if (left === undefined) throw new UpdatePolicyError('installed release version is not stable SemVer');
  if (right === undefined) return false;
  for (let index = 0; index < 3; index += 1) {
    const currentPart = left[index];
    const candidatePart = right[index];
    if (currentPart === undefined || candidatePart === undefined) {
      throw new UpdatePolicyError('stable SemVer has an invalid component count');
    }
    if (candidatePart !== currentPart) return candidatePart > currentPart;
  }
  return false;
}

export function compareInstalledVersion(installed: string, requested: string): InstalledVersionOrder {
  const left = stableParts(installed);
  const right = stableParts(requested);
  if (left === undefined || right === undefined) {
    throw new UpdatePolicyError('installed and requested releases must use stable SemVer');
  }
  for (let index = 0; index < 3; index += 1) {
    const installedPart = left[index];
    const requestedPart = right[index];
    if (installedPart === undefined || requestedPart === undefined) {
      throw new UpdatePolicyError('stable SemVer has an invalid component count');
    }
    if (installedPart < requestedPart) return 'older';
    if (installedPart > requestedPart) return 'newer';
  }
  return 'same';
}

class UpdatePolicyError extends Error {
  name = 'UpdatePolicyError';
}

export function shouldCheck(
  lastStatus: 'started' | 'success' | 'failed' | undefined,
  lastAttemptAt: number | undefined,
  now: number,
): boolean {
  if (lastAttemptAt === undefined) return true;
  const interval = lastStatus === 'failed' || lastStatus === 'started' ? 30 * 60_000 : 24 * 60 * 60_000;
  return now - lastAttemptAt >= interval;
}

function stableParts(version: string): number[] | undefined {
  if (!stableSemver.test(version)) return undefined;
  return version.split('.').map(Number);
}
