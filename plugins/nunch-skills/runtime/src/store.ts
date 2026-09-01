import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { createLifecycleState, type LifecycleState, lifecycleStateSchema } from './state.ts';

const lockSchema = z.strictObject({
  owner: z.string().uuid(),
  pid: z.number().int().positive(),
  createdAt: z.number().int(),
});
type LockRecord = z.infer<typeof lockSchema>;
type LockHandle = { release: () => Promise<void> };

class StoreError extends Error {
  name = 'StoreError';
}

class LockBusyError extends Error {
  name = 'LockBusyError';
}

export class LifecycleStore {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<LifecycleState> {
    try {
      const info = await lstat(this.path);
      if (info.isSymbolicLink()) throw new StoreError(`state path is a symlink: ${this.path}`);
      return lifecycleStateSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if (isMissing(error)) return createLifecycleState();
      if (error instanceof StoreError || error instanceof z.ZodError || error instanceof SyntaxError) throw error;
      throw new StoreError(`read lifecycle state: ${this.path}`, { cause: error });
    }
  }

  async save(state: LifecycleState): Promise<void> {
    const parsed = lifecycleStateSchema.parse(state);
    await writeAtomic(this.path, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}

export async function acquireLock(path: string, now: number, staleAfter: number): Promise<LockHandle> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const record: LockRecord = { owner: randomUUID(), pid: process.pid, createdAt: now };
  try {
    await createLock(path, record);
  } catch (error) {
    if (!isExists(error)) throw new StoreError(`create lock: ${path}`, { cause: error });
    const existing = lockSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (now - existing.createdAt < staleAfter || processExists(existing.pid)) throw new LockBusyError('lock is busy');
    const stalePath = `${path}.stale.${record.owner}`;
    try {
      await rename(path, stalePath);
    } catch (renameError) {
      if (isMissing(renameError)) throw new LockBusyError('lock is busy');
      throw renameError;
    }
    try {
      await createLock(path, record);
    } catch (retryError) {
      if (isExists(retryError)) throw new LockBusyError('lock is busy');
      throw retryError;
    } finally {
      await rm(stalePath, { force: true });
    }
  }
  return {
    release: async () => {
      let current: LockRecord;
      try {
        current = lockSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      if (current.owner !== record.owner) throw new StoreError('lock ownership changed');
      await rm(path);
    },
  };
}

export async function writeAtomic(path: string, content: string): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new StoreError(`refusing symlink target: ${path}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const temporary = join(parent, `.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  await syncDirectory(parent);
}

export async function syncDirectory(path: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform === 'win32') return;
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function createLock(path: string, record: LockRecord): Promise<void> {
  return open(path, 'wx', 0o600).then(async (file) => {
    try {
      await file.writeFile(`${JSON.stringify(record)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    return true;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
