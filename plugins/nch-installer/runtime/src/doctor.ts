import type { z } from 'zod';
import type { CommandRunner, pluginSchema } from './codex-schema.ts';
import { CommandError, ExecRunner } from './command.ts';
import { inspectDependencies } from './dependencies.ts';
import type { LifecycleStore } from './store.ts';

export type DoctorItem = { name: string; status: 'ok' | 'warning' | 'error'; detail?: string; fix?: string };

export type ExecutableProbe = CommandRunner;

type DoctorProgress = (name: string, status: 'started' | 'completed' | 'failed', detail?: string) => void;
export interface DoctorBackend {
  listPluginRecords(): Promise<z.infer<typeof pluginSchema>[]>;
  verifyInstallerIntegrity(): Promise<string>;
  verifyTrust(): Promise<void>;
}
type LifecycleDoctorInput = { backend: DoctorBackend; store: LifecycleStore };
type DoctorPlatform = 'codex' | 'claude';

export async function runDoctor(
  probe: ExecutableProbe = new ExecRunner({ timeout: 10_000 }),
  progress: DoctorProgress = () => undefined,
  platforms: DoctorPlatform[] = ['codex', 'claude'],
): Promise<DoctorItem[]> {
  const checks: [string, string[], string][] = [
    ['node', ['--version'], 'Node.js'],
    ['git', ['--version'], 'Git'],
  ];
  if (platforms.includes('codex')) checks.push(['codex', ['--version'], 'Codex CLI']);
  if (platforms.includes('claude')) checks.push(['claude', ['--version'], 'Claude Code CLI']);
  const results: DoctorItem[] = [];
  for (const [command, args, name] of checks) {
    results.push(await executableCheck(probe, command, args, name, progress));
  }
  return results;
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
        await input.backend.verifyInstallerIntegrity();
        return 'installed installer matches the verified release';
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
        return 'installer hook trust matches the installed payload';
      },
      fix: 'Installer를 검증된 릴리스로 다시 설치해 hook 신뢰 해시를 복구한 뒤 다시 진단하세요.',
    },
    {
      name: 'ownership',
      check: async () => {
        const keys = state.resources.map((resource) => `${resource.kind}:${resource.name}`);
        if (new Set(keys).size !== keys.length) throw new DoctorFailure('ownership ledger contains duplicates');
        return `${state.resources.length} resources recorded`;
      },
      fix: 'Installer에서 제거 후 다시 설치해 소유권 ledger를 재생성한 뒤 다시 진단하세요.',
    },
  ];
  return Promise.all(
    checks.map(async ({ name, check, fix }): Promise<DoctorItem> => {
      progress(name, 'started');
      try {
        const detail = await check();
        progress(name, 'completed', detail);
        return { name, status: 'ok', detail };
      } catch (error) {
        const missingManifest =
          error instanceof CommandError && error.message === 'verified release manifest is missing';
        if (missingManifest && (name === 'integrity' || name === 'trust')) {
          const detail = `원인: verified release manifest is missing → 릴리스로 게시되지 않은 개발 체크아웃에서 실행한 것으로 보입니다.\n개발 환경에서는 정상 상태이며, npm 릴리스 설치본에서 같은 결과가 나오면 다시 설치하세요.`;
          progress(name, 'completed', detail);
          return { name, status: 'warning', detail, fix };
        }
        if (error instanceof DoctorWarning) {
          const detail = `${causeDetail(error)}\n${error.detail}`;
          progress(name, 'completed', detail);
          return { name, status: 'warning', detail, fix };
        }
        const detail = causeDetail(error);
        const item: DoctorItem = {
          name,
          status: 'error',
          detail,
          fix,
        };
        progress(name, 'failed', detail);
        return item;
      }
    }),
  );
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

async function executableCheck(
  probe: ExecutableProbe,
  command: string,
  args: string[],
  name: string,
  progress: DoctorProgress,
): Promise<DoctorItem> {
  progress(name, 'started');
  return probe.run(command, args).then(
    (output) => {
      const detail = output.trim();
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
