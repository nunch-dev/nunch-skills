import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { z } from 'zod';
import type { pluginSchema } from './codex-schema.ts';
import { inspectDependencies } from './dependencies.ts';
import type { LifecycleStore } from './store.ts';

const execFileAsync = promisify(execFile);

export type DoctorItem = { name: string; status: 'ok' | 'warning' | 'error'; detail?: string; fix?: string };

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
  const checks: { name: string; check: () => Promise<string>; fix: string }[] = [
    {
      name: 'dependencies',
      check: async () => {
        const report = await inspectDependencies(await input.backend.listPluginRecords());
        const count = report.missing.length + report.manual.length;
        if (count > 0) {
          const issues = [
            ...report.missing.map((item) => `누락: ${item.requirement} (${item.requiredBy.join(', ')})`),
            ...report.manual.map((item) => `수동 설정: ${item.requirement} (${item.requiredBy.join(', ')})`),
          ];
          throw new DoctorWarning(`${count} dependencies require setup`, issues.join('\n'));
        }
        return 'all declared dependencies are available';
      },
      fix: '표시된 실행 파일을 설치하거나 필요한 수동 설정을 완료한 뒤 다시 진단하세요.',
    },
    {
      name: 'integrity',
      check: async () => {
        await input.backend.verifyManagerIntegrity();
        return 'installed manager matches the verified release';
      },
      fix: '검증된 npm 릴리스로 다시 설치하거나 업데이트한 뒤 다시 진단하세요.',
    },
    {
      name: 'transaction',
      check: async () => {
        if (state.operation !== undefined)
          throw new DoctorFailure(`${state.operation.kind} stopped at ${state.operation.phase}`);
        return 'no interrupted lifecycle transaction';
      },
      fix: '같은 릴리스를 다시 설치해 중단된 트랜잭션을 복구한 뒤 다시 진단하세요.',
    },
    {
      name: 'trust',
      check: async () => {
        await input.backend.verifyTrust();
        return 'manager hook trust matches the installed payload';
      },
      fix: 'Manager를 검증된 릴리스로 다시 설치해 hook 신뢰 해시를 복구한 뒤 다시 진단하세요.',
    },
    {
      name: 'ownership',
      check: async () => {
        const keys = state.resources.map((resource) => `${resource.kind}:${resource.name}`);
        if (new Set(keys).size !== keys.length) throw new DoctorFailure('ownership ledger contains duplicates');
        return `${state.resources.length} resources recorded`;
      },
      fix: 'Manager에서 제거 후 다시 설치해 소유권 ledger를 재생성한 뒤 다시 진단하세요.',
    },
  ];
  const report: DoctorItem[] = [];
  for (const { name, check, fix } of checks) {
    progress(name, 'started');
    try {
      const detail = await check();
      report.push({ name, status: 'ok', detail });
      progress(name, 'completed', detail);
    } catch (error) {
      if (error instanceof DoctorWarning) {
        const detail = `${causeDetail(error)}\n${error.detail}`;
        report.push({ name, status: 'warning', detail, fix });
        progress(name, 'completed', detail);
        continue;
      }
      const detail = causeDetail(error);
      report.push({
        name,
        status: 'error',
        detail,
        fix,
      });
      progress(name, 'failed', detail);
    }
  }
  return report;
}

class DoctorWarning extends Error {
  name = 'DoctorWarning';
  detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.detail = detail;
  }
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
  return probe.version(command, args).then(
    (detail) => {
      progress(name, 'completed');
      return { name, status: 'ok', detail };
    },
    (error: unknown) => {
      const detail = causeDetail(error);
      progress(name, 'failed', detail);
      return { name, status: 'error', detail };
    },
  );
}

function causeDetail(error: unknown): string {
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return `원인: ${messages.length === 0 ? '알 수 없는 오류' : messages.join(' → ')}`;
}
