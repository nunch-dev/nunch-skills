import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { z } from 'zod';

import { isMissing } from './filesystem.ts';

const operationSchema = z.strictObject({
  destination: z.string(),
  candidate: z.string(),
  backup: z.string(),
  hadDestination: z.boolean(),
});
const journalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ownerPid: z.number().int().positive(),
  operations: z.array(operationSchema),
});
type Journal = z.infer<typeof journalSchema>;

class TransactionError extends Error {
  name = 'TransactionError';
}

export async function recoverTransaction(transactionRoot: string): Promise<boolean> {
  await cleanupPreparedTransactions(transactionRoot);
  const journalPath = join(transactionRoot, 'journal.json');
  let journal: Journal;
  try {
    journal = journalSchema.parse(JSON.parse(await readFile(journalPath, 'utf8')));
  } catch (error) {
    if (isMissing(error)) {
      if (await destinationExists(transactionRoot)) {
        await rm(transactionRoot, { recursive: true, force: true });
        return true;
      }
      return false;
    }
    throw new TransactionError('cannot read recovery journal', { cause: error });
  }
  if (processExists(journal.ownerPid)) {
    throw new TransactionError('another upstream transaction is active');
  }
  await rollback(journal);
  await rm(transactionRoot, { recursive: true, force: true });
  return true;
}

export async function applyTransaction(transactionRoot: string, operations: Journal['operations']): Promise<void> {
  const journal: Journal = { schemaVersion: 1, ownerPid: process.pid, operations };
  const preparedRoot = `${transactionRoot}.prepare-${process.pid}-${randomUUID()}`;
  await mkdir(preparedRoot, { recursive: false });
  await writeFile(join(preparedRoot, 'journal.json'), `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' });
  try {
    await rename(preparedRoot, transactionRoot);
  } catch (error) {
    await rm(preparedRoot, { recursive: true, force: true });
    throw new TransactionError('another upstream transaction is active', { cause: error });
  }
  try {
    for (const operation of operations) {
      await mkdir(dirname(operation.destination), { recursive: true });
      if (operation.hadDestination) await rename(operation.destination, operation.backup);
      await rename(operation.candidate, operation.destination);
    }
    await rm(transactionRoot, { recursive: true, force: true });
  } catch (error) {
    try {
      await rollback(journal);
      await rm(transactionRoot, { recursive: true, force: true });
    } catch (rollbackError) {
      throw new TransactionError('apply and rollback failed; recovery journal preserved', {
        cause: rollbackError,
      });
    }
    throw new TransactionError('apply failed and was rolled back', { cause: error });
  }
}

export async function destinationExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function rollback(journal: Journal): Promise<void> {
  for (const operation of [...journal.operations].reverse()) {
    const backupExists = await destinationExists(operation.backup);
    if (backupExists) {
      await rm(operation.destination, { recursive: true, force: true });
      await rename(operation.backup, operation.destination);
      continue;
    }
    if (!operation.hadDestination) await rm(operation.destination, { recursive: true, force: true });
  }
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

async function cleanupPreparedTransactions(transactionRoot: string): Promise<void> {
  const parent = dirname(transactionRoot);
  const prefix = `${basename(transactionRoot)}.prepare-`;
  let entries: Dirent[];
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const pidText = entry.name.slice(prefix.length).split('-', 1)[0];
    const pid = pidText === undefined ? Number.NaN : Number(pidText);
    if (Number.isInteger(pid) && pid > 0 && processExists(pid)) continue;
    await rm(join(parent, entry.name), { recursive: true, force: true });
  }
}
