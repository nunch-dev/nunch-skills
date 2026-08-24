import * as clack from '@clack/prompts';
import type { ProgressEvent } from '../../plugins/nunch-skills-manager/runtime/src/lifecycle.ts';
import type { CliOperation, PublicCliDependencies } from './public-cli.ts';

const phaseLabels: Record<ProgressEvent['phase'], string> = {
  marketplace: '마켓플레이스 확인',
  plugins: '스킬 처리',
  trust: 'Manager hook 신뢰 확인',
  verify: '상태 검증',
  rollback: '이전 상태 복구',
};
const doctorLabels: Record<string, string> = {
  dependencies: '실행 의존성',
  integrity: '릴리스 무결성',
  transaction: '중단된 작업',
  trust: 'Manager hook 신뢰',
  ownership: '설치 소유권',
  'Node.js': 'Node.js',
  Git: 'Git',
  'Codex CLI': 'Codex CLI',
};

export class ClackUi {
  activeSpinner = clack.spinner();

  intro(): void {
    clack.intro('Nunch Skills');
  }

  async chooseOperation(): Promise<CliOperation> {
    const result = await clack.select({
      message: '무엇을 할까요?',
      options: [
        { value: 'install', label: '스킬 설치' },
        { value: 'update', label: '전체 업데이트' },
        { value: 'uninstall', label: '스킬 삭제' },
        { value: 'doctor', label: '상태 진단' },
        { value: 'settings', label: '설정' },
      ],
    });
    if (clack.isCancel(result)) return 'cancel';
    return result;
  }

  async choosePlugins(plugins: string[]): Promise<string[] | undefined> {
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

  progress(event: ProgressEvent): void {
    const phase = phaseLabels[event.phase];
    const target =
      event.target === undefined
        ? undefined
        : Object.entries(doctorLabels).reduce(
            (label, [source, localized]) => label.replace(source, localized),
            event.target,
          );
    const label = target === undefined ? phase : `${phase} · ${target}`;
    if (event.status === 'started') {
      this.activeSpinner.start(label);
      return;
    }
    if (event.status === 'completed') {
      this.activeSpinner.stop(`${label} 완료`);
      return;
    }
    if (event.status === 'skipped') {
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

export function bindUiDependencies(
  ui: ClackUi,
  dependencies: Omit<PublicCliDependencies, 'chooseOperation' | 'choosePlugins' | 'confirm' | 'writeError'>,
): PublicCliDependencies {
  return {
    ...dependencies,
    chooseOperation: () => ui.chooseOperation(),
    choosePlugins: (plugins) => ui.choosePlugins(plugins),
    confirm: (message) => ui.confirm(message),
    writeError: (message) => ui.error(message),
  };
}
