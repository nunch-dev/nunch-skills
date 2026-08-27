import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import { parseConfig, resolveInside, type UpstreamSpec } from './config.ts';
import { copyEntry, ensureRealpathConfinement } from './filesystem.ts';
import { sanitizeSkills } from './frontmatter.ts';
import { applyTransaction, destinationExists, recoverTransaction } from './transaction.ts';

const execFileAsync = promisify(execFile);
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;
const versionFieldPattern = /("version"\s*:\s*)"[^"]*"/g;
const marketplaceSchema = z.looseObject({
  plugins: z.array(z.looseObject({ name: z.string(), version: z.string() })),
});

type SyncOptions = { root: string; configPath: string; lockPath: string };
type Prepared = { spec: UpstreamSpec; checkout: string; commit: string };
type Operation = { destination: string; candidate: string; backup: string; hadDestination: boolean };
type Preparation = { root: string; candidates: string; transactionRoot: string; operations: Operation[] };

class SyncError extends Error {
  name = 'SyncError';
}

export async function syncConfigured(options: SyncOptions): Promise<void> {
  const root = resolve(options.root);
  const transactionRoot = join(root, '.upstream-sync-transaction');
  await recoverTransaction(transactionRoot);
  const config = parseConfig(JSON.parse(await readFile(options.configPath, 'utf8')));
  const checkoutRoot = await mkdtemp(join(tmpdir(), 'nunch-upstream-sync-'));
  const candidateRoot = await mkdtemp(join(tmpdir(), 'nunch-upstream-candidates-'));
  try {
    const prepared: Prepared[] = [];
    for (const upstream of config.upstreams) prepared.push(await prepareUpstream(checkoutRoot, upstream));
    const operations: Operation[] = [];
    const preparation: Preparation = { root, candidates: candidateRoot, transactionRoot, operations };
    const commits: Record<string, string> = {};
    for (const upstream of prepared) {
      await prepareCopies(preparation, upstream);
      await prepareVersions(preparation, upstream);
      commits[upstream.spec.name] = upstream.commit;
    }
    const lockCandidate = join(candidateRoot, `candidate-${operations.length}`);
    await writeFile(lockCandidate, `${JSON.stringify({ upstreams: commits }, null, 2)}\n`);
    operations.push(await operationFor(options.lockPath, lockCandidate, transactionRoot, operations.length));
    await applyTransaction(transactionRoot, operations);
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true });
    await rm(candidateRoot, { recursive: true, force: true });
  }
}

function buildVersion(version: string, commit: string): string {
  return `${version.split('+')[0]}+upstream.${commit.slice(0, 12)}`;
}

async function prepareUpstream(checkoutRoot: string, spec: UpstreamSpec): Promise<Prepared> {
  const checkout = join(checkoutRoot, spec.name);
  try {
    await execFileAsync('git', [
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      spec.ref,
      spec.repository,
      checkout,
    ]);
    const { stdout } = await execFileAsync('git', ['-C', checkout, 'rev-parse', 'HEAD']);
    for (const copy of spec.copies) await lstat(resolveInside(checkout, copy.source));
    if (spec.version !== undefined) await sourceVersion(checkout, spec.version.source);
    return { spec, checkout, commit: stdout.trim() };
  } catch (error) {
    throw new SyncError(`prepare ${spec.name} failed`, { cause: error });
  }
}

async function prepareCopies(preparation: Preparation, upstream: Prepared): Promise<void> {
  for (const copy of upstream.spec.copies) {
    const destination = resolveInside(preparation.root, copy.destination);
    await ensureRealpathConfinement(preparation.root, destination);
    const index = preparation.operations.length;
    const candidate = join(preparation.candidates, `candidate-${index}`);
    await copyEntry(resolveInside(upstream.checkout, copy.source), candidate);
    await sanitizeSkills(candidate, copy.removeFrontmatter ?? []);
    preparation.operations.push(await operationFor(destination, candidate, preparation.transactionRoot, index));
  }
}

async function prepareVersions(preparation: Preparation, upstream: Prepared): Promise<void> {
  const versionSpec = upstream.spec.version;
  if (versionSpec === undefined) return;
  const upstreamVersion = await sourceVersion(upstream.checkout, versionSpec.source);
  const version = versionSpec.appendCommit ? buildVersion(upstreamVersion, upstream.commit) : upstreamVersion;
  for (const target of versionSpec.targets) {
    const destination = resolveInside(preparation.root, target);
    await ensureRealpathConfinement(preparation.root, destination);
    await updatePreparedFile(preparation, destination, (source) => {
      const matches = [...source.matchAll(versionFieldPattern)];
      if (matches.length !== 1) throw new SyncError(`manifest must contain exactly one version field: ${target}`);
      return source.replace(versionFieldPattern, `$1"${version}"`);
    });
  }
  for (const target of versionSpec.marketplaceTargets) {
    const destination = resolveInside(preparation.root, target);
    await ensureRealpathConfinement(preparation.root, destination);
    await updatePreparedFile(preparation, destination, (source) => {
      const marketplace = marketplaceSchema.parse(JSON.parse(source));
      const entry = marketplace.plugins.find((plugin) => plugin.name === upstream.spec.name);
      if (entry === undefined) throw new SyncError(`marketplace is missing ${upstream.spec.name}: ${target}`);
      entry.version = version;
      return `${JSON.stringify(marketplace, null, 2)}\n`;
    });
  }
}

async function updatePreparedFile(
  preparation: Preparation,
  destination: string,
  update: (source: string) => string,
): Promise<void> {
  const preparedOperation = preparation.operations.find(
    (operation) => destination === operation.destination || destination.startsWith(`${operation.destination}${sep}`),
  );
  const sourcePath =
    preparedOperation === undefined
      ? destination
      : join(preparedOperation.candidate, relative(preparedOperation.destination, destination));
  const updated = update(await readFile(sourcePath, 'utf8'));
  if (preparedOperation !== undefined) {
    await writeFile(sourcePath, updated);
    return;
  }
  const candidate = join(preparation.candidates, `candidate-${preparation.operations.length}`);
  await writeFile(candidate, updated);
  preparation.operations.push(
    await operationFor(destination, candidate, preparation.transactionRoot, preparation.operations.length),
  );
}

async function sourceVersion(checkout: string, relative: string): Promise<string> {
  const parsed: unknown = JSON.parse(await readFile(resolveInside(checkout, relative), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || typeof parsed.version !== 'string') {
    throw new SyncError(`version source is invalid: ${relative}`);
  }
  if (!versionPattern.test(parsed.version)) throw new SyncError(`version source has invalid version: ${relative}`);
  return parsed.version;
}

async function operationFor(destination: string, candidate: string, tx: string, index: number): Promise<Operation> {
  return {
    destination,
    candidate,
    backup: join(tx, `backup-${index}-${basename(destination)}`),
    hadDestination: await destinationExists(destination),
  };
}
