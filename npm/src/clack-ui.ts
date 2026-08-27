import * as clack from '@clack/prompts';
import type { ProgressEvent } from '../../plugins/nunch-skills/runtime/src/lifecycle.ts';
import type { InstallPlatform, InstallTarget, PublicCliDependencies } from './public-cli.ts';

const phaseLabels: Record<ProgressEvent['phase'], string> = {
  marketplace: '마켓플레이스 확인',
  plugins: '스킬 처리',
  trust: 'Installer hook 신뢰 확인',
  verify: '상태 검증',
  rollback: '이전 상태 복구',
};
const doctorLabels: Record<string, string> = {
  dependencies: '실행 의존성',
  integrity: '릴리스 무결성',
  transaction: '중단된 작업',
  trust: 'Installer hook 신뢰',
  ownership: '설치 소유권',
  'cli-version': 'Nunch Skills CLI',
  'installed:codex': 'Codex 설치 스킬',
  'installed:claude': 'Claude Code 설치 스킬',
  'Node.js': 'Node.js',
  Git: 'Git',
  'Codex CLI': 'Codex CLI',
  'Claude Code CLI': 'Claude Code CLI',
};
const targetLabels: Record<InstallTarget, string> = { codex: 'Codex', claude: 'Claude Code' };

export class ClackUi {
  activeSpinner = clack.spinner();

  intro(): void {
    clack.intro('Nunch Skills');
  }

  async choosePlatform(initial?: InstallPlatform): Promise<InstallPlatform | undefined> {
    const result = await clack.select({
      message: '설치 대상 플랫폼을 선택하세요',
      options: [
        { value: 'codex' as const, label: 'Codex' },
        { value: 'claude' as const, label: 'Claude Code' },
        { value: 'both' as const, label: '둘 다' },
      ],
      initialValue: initial,
    });
    return clack.isCancel(result) ? undefined : result;
  }

  async choosePlugins(plugins: string[]): Promise<string[] | undefined> {
    if (plugins.length === 0) return [];
    const result = await clack.multiselect({
      message: '대상 스킬을 선택하세요',
      options: plugins.map((plugin) => ({ value: plugin, label: plugin })),
      required: false,
    });
    if (clack.isCancel(result)) return undefined;
    return result;
  }

  async confirm(message: string): Promise<boolean> {
    const result = await clack.confirm({ message });
    return clack.isCancel(result) ? false : result;
  }

  progress(event: ProgressEvent, targetPrefix?: string): void {
    const phase = phaseLabels[event.phase];
    const target =
      event.target === undefined
        ? undefined
        : Object.entries(doctorLabels).reduce(
            (label, [source, localized]) => label.replace(source, localized),
            event.target,
          );
    const base = target === undefined ? phase : `${phase} · ${target}`;
    const label = targetPrefix === undefined ? base : `[${targetPrefix}] ${base}`;
    if (event.status === 'started') {
      this.activeSpinner.start(label);
      return;
    }
    if (event.status === 'completed') {
      this.activeSpinner.stop(`${label} 완료`);
      return;
    }
    if (event.status === 'skipped') {
      this.activeSpinner.start(label);
      this.activeSpinner.stop(`${label} 건너뜀`);
      return;
    }
    this.activeSpinner.stop(`${label} 실패`);
  }

  success(message: string): void {
    clack.outro(message);
  }

  error(message: string): void {
    clack.log.error(message);
  }
}

export function targetLabel(target: InstallTarget): string {
  return targetLabels[target];
}

export function bindUiDependencies(
  ui: ClackUi,
  dependencies: Omit<
    PublicCliDependencies,
    'choosePlatform' | 'choosePlugins' | 'confirm' | 'writeError' | 'writeOutput'
  >,
): PublicCliDependencies {
  return {
    ...dependencies,
    choosePlatform: (initial) => ui.choosePlatform(initial),
    choosePlugins: (plugins) => ui.choosePlugins(plugins),
    confirm: (message) => ui.confirm(message),
    writeError: (message) => process.stderr.write(message),
    writeOutput: (message) => process.stdout.write(message),
  };
}
