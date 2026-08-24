import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { writeAtomic } from './store.ts';

const stateSchema = z.discriminatedUnion('enabled', [
  z.strictObject({ enabled: z.literal(true), installationId: z.string().uuid() }),
  z.strictObject({ enabled: z.literal(false) }),
]);
type TelemetryState = z.infer<typeof stateSchema>;

export async function loadTelemetryState(path: string, disabledByEnvironment: boolean): Promise<TelemetryState> {
  if (disabledByEnvironment) return { enabled: false };
  try {
    return stateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      const state: TelemetryState = { enabled: true, installationId: randomUUID() };
      await writeAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
      return state;
    }
    throw error;
  }
}

export async function setTelemetryEnabled(path: string, enabled: boolean): Promise<TelemetryState> {
  const previous = await loadTelemetryState(path, false);
  if (!enabled) {
    await clearTelemetryData(dirname(path));
    const state: TelemetryState = { enabled: false };
    await writeAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }
  const state: TelemetryState = {
    enabled: true,
    installationId: previous.enabled ? previous.installationId : randomUUID(),
  };
  await writeAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export async function clearTelemetryData(root: string): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const name of ['telemetry.json', 'installation-id', 'dedupe.json', 'telemetry-diagnostics.jsonl']) {
    await rm(join(root, name), { force: true });
  }
}

export async function appendTelemetryDiagnostic(path: string, event: string, now: number): Promise<void> {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  let existing = '';
  try {
    existing = await readFile(path, 'utf8');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const rows = existing
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => diagnosticTimestamp(line) >= cutoff);
  rows.push(JSON.stringify({ event, occurredAt: now }));
  while (Buffer.byteLength(`${rows.join('\n')}\n`) > 256 * 1024) rows.shift();
  await writeAtomic(path, `${rows.join('\n')}\n`);
}

function diagnosticTimestamp(line: string): number {
  try {
    const parsed: unknown = JSON.parse(line);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'occurredAt' in parsed &&
      typeof parsed.occurredAt === 'number'
    ) {
      return parsed.occurredAt;
    }
  } catch (error) {
    if (error instanceof SyntaxError) return 0;
    throw error;
  }
  return 0;
}
