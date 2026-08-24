import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { z } from 'zod';
import type { pluginSchema } from './codex-schema.ts';
import { inspectDependencies } from './dependencies.ts';
import type { LifecycleStore } from './store.ts';

const execFileAsync = promisify(execFile);

type DoctorItem = { name: string; status: 'ok' | 'warning' | 'error'; detail?: string };

export interface ExecutableProbe {
  version(command: string, args: string[]): Promise<string>;
}

type DoctorProgress = (name: string, status: 'started' | 'completed' | 'failed', detail?: string) => void;
export interface DoctorBackend {
  listPluginRecords(): Promise<z.infer<typeof pluginSchema>[]>;
  verifyManagerIntegrity(): Promise<string>;
  verifyTrust(): Promise<void>;
}
type LifecycleDoctorInput = { backend: DoctorBackend; store: LifecycleStore };

export async function runDoctor(
  probe: ExecutableProbe = new ProcessProbe(),
  progress: DoctorProgress = () => undefined,
): Promise<DoctorItem[]> {
  const checks: [string, string[], string][] = [
    ['node', ['--version'], 'Node.js'],
    ['git', ['--version'], 'Git'],
    ['codex', ['--version'], 'Codex CLI'],
  ];
  const report: DoctorItem[] = [];
  for (const [command, args, name] of checks) report.push(await executableCheck(probe, command, args, name, progress));
  return report;
}

export async function runLifecycleDoctor(
  input: LifecycleDoctorInput,
  progress: DoctorProgress = () => undefined,
): Promise<DoctorItem[]> {
  const state = await input.store.load();
  const checks: [string, () => Promise<string>][] = [
    [
      'dependencies',
      async () => {
        const report = await inspectDependencies(await input.backend.listPluginRecords());
        const count = report.missing.length + report.manual.length;
        if (count > 0) throw new DoctorWarning(`${count} dependencies require setup`);
        return 'all declared dependencies are available';
      },
    ],
    [
      'integrity',
      async () => {
        await input.backend.verifyManagerIntegrity();
        return 'installed manager matches the verified release';
      },
    ],
    [
      'transaction',
      async () => {
        if (state.operation !== undefined)
          throw new DoctorFailure(`${state.operation.kind} stopped at ${state.operation.phase}`);
        return 'no interrupted lifecycle transaction';
      },
    ],
    [
      'trust',
      async () => {
        await input.backend.verifyTrust();
        return 'manager hook trust matches the installed payload';
      },
    ],
    [
      'ownership',
      async () => {
        const keys = state.resources.map((resource) => `${resource.kind}:${resource.name}`);
        if (new Set(keys).size !== keys.length) throw new DoctorFailure('ownership ledger contains duplicates');
        return `${state.resources.length} resources recorded`;
      },
    ],
  ];
  const report: DoctorItem[] = [];
  for (const [name, check] of checks) {
    progress(name, 'started');
    try {
      const detail = await check();
      report.push({ name, status: 'ok', detail });
      progress(name, 'completed', detail);
    } catch (error) {
      if (error instanceof DoctorWarning) {
        report.push({ name, status: 'warning', detail: error.message });
        progress(name, 'completed', error.message);
        continue;
      }
      const detail = error instanceof Error ? error.message : 'unknown failure';
      report.push({
        name,
        status: 'error',
        detail,
      });
      progress(name, 'failed', detail);
    }
  }
  return report;
}

class DoctorWarning extends Error {
  name = 'DoctorWarning';
}

class DoctorFailure extends Error {
  name = 'DoctorFailure';
}

class ProcessProbe implements ExecutableProbe {
  async version(command: string, args: string[]): Promise<string> {
    return (await execFileAsync(command, args, { encoding: 'utf8', timeout: 10_000 })).stdout.trim();
  }
}

async function executableCheck(
  probe: ExecutableProbe,
  command: string,
  args: string[],
  name: string,
  progress: DoctorProgress,
): Promise<DoctorItem> {
  progress(name, 'started');
  try {
    const item: DoctorItem = { name, status: 'ok', detail: await probe.version(command, args) };
    progress(name, 'completed');
    return item;
  } catch (error) {
    progress(name, 'failed');
    return { name, status: 'error', detail: error instanceof Error ? error.message : 'unknown failure' };
  }
}
