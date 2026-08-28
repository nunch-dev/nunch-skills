import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';
import type { ReleaseManifest } from './release-manifest.ts';
import { writeAtomic } from './store.ts';

const hookIdentitySchema = z.strictObject({
  event_name: z.literal('session_start'),
  hooks: z
    .array(
      z.strictObject({
        async: z.literal(false),
        command: z.string().min(1),
        statusMessage: z.string(),
        timeout: z.literal(15),
        type: z.literal('command'),
      }),
    )
    .length(1),
  matcher: z.literal('startup|resume|clear|compact'),
});

const hashPattern = /^sha256:[0-9a-f]{64}$/;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const hookFileSchema = z.strictObject({
  hooks: z.strictObject({
    SessionStart: z
      .array(
        z.strictObject({
          matcher: z.literal('startup|resume|clear|compact'),
          hooks: z
            .array(
              z.strictObject({
                type: z.literal('command'),
                command: z.string().min(1),
                commandWindows: z.string().min(1),
                timeout: z.literal(15),
                statusMessage: z.string(),
                async: z.literal(false).optional(),
              }),
            )
            .length(1),
        }),
      )
      .length(1),
  }),
});
const installerPrefix = 'plugins/nunch-skills/';

class TrustConflictError extends Error {
  name = 'TrustConflictError';
}

export function hookTrustHash(identity: unknown): string {
  const parsed = hookIdentitySchema.parse(identity);
  return `sha256:${createHash('sha256').update(JSON.stringify(parsed)).digest('hex')}`;
}

export async function verifyInstallerPayload(
  pluginRoot: string,
  manifest: ReleaseManifest,
  platform: NodeJS.Platform,
): Promise<string> {
  const files = [manifest.plugin, manifest.hook, manifest.runtime, ...manifest.scripts];
  const verified = new Map<string, Buffer>();
  for (const file of files) {
    if (!file.path.startsWith(installerPrefix)) throw new TrustConflictError('installer payload path differs');
    const path = join(pluginRoot, file.path.slice(installerPrefix.length));
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new TrustConflictError('installer payload is unsafe');
    const content = await readFile(path);
    const digest = createHash('sha256').update(content).digest('hex');
    if (digest !== file.sha256) throw new TrustConflictError('installer payload digest differs');
    verified.set(file.path, content);
  }
  const hookBytes = verified.get(manifest.hook.path);
  if (hookBytes === undefined) throw new TrustConflictError('verified installer hook is missing');
  const hookFile = hookFileSchema.parse(JSON.parse(hookBytes.toString('utf8')));
  const group = hookFile.hooks.SessionStart[0];
  const hook = group?.hooks[0];
  if (group === undefined || hook === undefined) throw new TrustConflictError('installer hook is missing');
  return hookTrustHash({
    event_name: 'session_start',
    hooks: [
      {
        async: false,
        command: platform === 'win32' ? hook.commandWindows : hook.command,
        statusMessage: hook.statusMessage,
        timeout: hook.timeout,
        type: hook.type,
      },
    ],
    matcher: group.matcher,
  });
}

export class TrustEditor {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  async upsert(id: string, expectedHash: string, newHash: string): Promise<void> {
    validate(id, newHash);
    const original = await readConfig(this.path);
    const section = findSection(original, id);
    let updated: string;
    if (section === undefined) {
      if (expectedHash.length > 0) throw new TrustConflictError('hook trust compare-and-swap conflict');
      const separator = original.length === 0 || original.endsWith('\n') ? '' : '\n';
      updated = `${original}${separator}\n[hooks.state."${id}"]\ntrusted_hash = "${newHash}"\n`;
    } else {
      if (section.hash !== expectedHash) throw new TrustConflictError('hook trust compare-and-swap conflict');
      const body = original.slice(section.start, section.end).replace(section.hash, newHash);
      updated = `${original.slice(0, section.start)}${body}${original.slice(section.end)}`;
    }
    await persist(this.path, original, updated);
  }

  async remove(id: string, expectedHash: string): Promise<void> {
    validate(id, expectedHash);
    const original = await readConfig(this.path);
    const section = findSection(original, id);
    if (section === undefined || section.hash !== expectedHash) {
      throw new TrustConflictError('hook trust compare-and-swap conflict');
    }
    const updated = `${original.slice(0, section.start)}${original.slice(section.end)}`.replace(/\n{3,}/g, '\n\n');
    await persist(this.path, original, updated);
  }
}

export async function inspectTrustHash(path: string, id: string): Promise<string | undefined> {
  return findSection(await readConfig(path), id)?.hash;
}

type TrustSection = { start: number; end: number; hash: string };

function findSection(config: string, id: string): TrustSection | undefined {
  const header = `[hooks.state."${id}"]`;
  const start = config.indexOf(header);
  if (start < 0) return undefined;
  const next = config.indexOf('\n[', start + header.length);
  const end = next < 0 ? config.length : next + 1;
  const body = config.slice(start, end);
  const hashes = [...body.matchAll(/^[ \t]*trusted_hash[ \t]*=[ \t]*"(sha256:[0-9a-f]+)"[ \t]*$/gm)];
  const hash = hashes[0]?.[1];
  if (hashes.length !== 1 || hash === undefined || !hashPattern.test(hash)) {
    throw new TrustConflictError('malformed hook trust section');
  }
  const sectionStart = start > 0 && config.slice(0, start).endsWith('\n\n') ? start - 1 : start;
  return { start: sectionStart, end, hash };
}

async function readConfig(path: string): Promise<string> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new TrustConflictError('unsafe config target');
    try {
      return utf8Decoder.decode(await readFile(path));
    } catch (error) {
      if (error instanceof TypeError) throw new TrustConflictError('config is not valid UTF-8', { cause: error });
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function persist(path: string, original: string, updated: string): Promise<void> {
  if (original === updated) return;
  await writeAtomic(`${path}.bak`, original);
  const guard = `${path}.nch-cas-${randomUUID()}`;
  try {
    await rename(path, guard);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT' && original.length === 0)) {
      throw error;
    }
    await writeExclusive(path, updated);
    return;
  }
  try {
    if (!(await readFile(guard)).equals(Buffer.from(original, 'utf8'))) {
      throw new TrustConflictError('hook trust compare-and-swap conflict');
    }
    await writeExclusive(path, updated);
  } catch (error) {
    let targetExists = true;
    try {
      await lstat(path);
    } catch (inspectError) {
      if (inspectError instanceof Error && 'code' in inspectError && inspectError.code === 'ENOENT') {
        targetExists = false;
      } else {
        throw inspectError;
      }
    }
    if (!targetExists) {
      try {
        await link(guard, path);
      } catch (restoreError) {
        if (!(restoreError instanceof Error && 'code' in restoreError && restoreError.code === 'EEXIST')) {
          throw restoreError;
        }
      }
    }
    await rm(guard, { force: true });
    throw error;
  }
  await rm(guard, { force: true });
}

async function writeExclusive(path: string, content: string): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = join(parent, `.nch-trust-${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  const directory = await open(parent, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function validate(id: string, hash: string): void {
  if (id.length === 0 || /["\r\n]/.test(id)) throw new TrustConflictError('invalid trust id');
  if (!hashPattern.test(hash)) throw new TrustConflictError('invalid trust hash');
}
