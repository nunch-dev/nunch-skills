import * as clack from '@clack/prompts';
import type { DoctorItem } from '../../plugins/nunch-skills-manager/runtime/src/doctor.ts';
import type { ProgressEvent } from '../../plugins/nunch-skills-manager/runtime/src/lifecycle.ts';
import { copyToClipboard } from './clipboard.ts';
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
const doctorSymbols: Record<DoctorItem['status'], string> = { ok: '✔', warning: '⚠', error: '✖' };

export function formatDoctorReport(report: DoctorItem[]): string {
  const lines = ['상태 진단 결과', '────────────────────────'];
  for (const item of report) {
    const label = doctorLabels[item.name] ?? item.name;
    lines.push(`${doctorSymbols[item.status]} ${label}`);
    if (item.detail !== undefined) lines.push(`  상세: ${item.detail.replaceAll('\n', '\n  ')}`);
    if (item.fix !== undefined) lines.push(`  조치: ${item.fix}`);
  }
  const passed = report.filter((item) => item.status === 'ok').length;
  const failed = report.filter((item) => item.status === 'error').length;
  const warnings = report.filter((item) => item.status === 'warning').length;
  lines.push('', '요약', '────────────────────────', `  ${passed} passed, ${failed} failed, ${warnings} warning`);
  return lines.join('\n');
}

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

  async doctorReport(report: DoctorItem[]): Promise<void> {
    clack.note(formatDoctorReport(report), '상태 진단 상세');
    const result = await clack.confirm({ message: 'AI 문제 해결 프롬프트를 클립보드에 복사할까요?' });
    if (clack.isCancel(result) || !result) return;
    try {
      await copyToClipboard(doctorAiPrompt(report));
      clack.log.success('AI 문제 해결 프롬프트를 클립보드에 복사했습니다.');
    } catch (error) {
      clack.log.error(`클립보드에 복사하지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  success(message: string): void {
    clack.outro(message);
  }

  error(message: string): void {
    clack.log.error(message);
  }
}

function doctorAiPrompt(report: DoctorItem[]): string {
  return [
    '다음 Nunch Skills 상태 진단 결과를 분석해 문제를 해결해 주세요.',
    '각 경고·오류의 근본 원인, 안전한 해결 순서, 실행할 명령을 설명해 주세요.',
    '설치된 플러그인이나 사용자 설정을 삭제·변경하기 전에는 영향과 되돌리는 방법을 먼저 알려 주세요.',
    '',
    formatDoctorReport(report),
  ].join('\n');
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
