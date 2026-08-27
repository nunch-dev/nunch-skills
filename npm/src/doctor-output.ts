import type { DoctorItem } from '../../plugins/nunch-skills/runtime/src/doctor.ts';

type DoctorSummary = {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  duration: number;
};

const labels: Record<string, string> = {
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

const symbols: Record<DoctorItem['status'], string> = { ok: '✔', warning: '⚠', error: '✖' };

export function formatDoctorDefault(report: DoctorItem[], duration: number): string {
  const issues = report.filter((item) => item.status !== 'ok');
  const lines = [header()];
  if (issues.length === 0) {
    lines.push(' ✔ Nunch Skills OK');
    return lines.join('\n');
  }
  const hasErrors = report.some((item) => item.status === 'error');
  lines.push(` ⚠ ${issues.length}개 문제 발견`, '');
  for (const [index, item] of issues.entries()) {
    lines.push(`${index + 1}. ${symbols[item.status]} ${label(item.name)}`);
    if (item.detail !== undefined) lines.push(`   ${indent(item.detail)}`);
    if (item.fix !== undefined) lines.push(`   조치: ${indent(item.fix)}`);
    lines.push('');
  }
  lines.push(summaryLine(summarize(report, duration)));
  if (!hasErrors) lines.push('설치는 정상 동작합니다. 경고 항목만 있으므로 그대로 사용해도 됩니다.');
  return lines.join('\n').trimEnd();
}

export function formatDoctorStatus(report: DoctorItem[], duration: number): string {
  const lines = [header()];
  for (const item of report) {
    const detail = item.detail?.split('\n')[0];
    lines.push(`  ${label(item.name).padEnd(22)} ${symbols[item.status]}${detail === undefined ? '' : ` ${detail}`}`);
  }
  lines.push('', `  ${summaryLine(summarize(report, duration))}`);
  return lines.join('\n');
}

export function formatDoctorVerbose(report: DoctorItem[], duration: number): string {
  const lines = [header(), '', '진단 항목', '────────────────────────────────────────'];
  for (const item of report) {
    lines.push(`  ${symbols[item.status]} ${label(item.name)}`);
    if (item.detail !== undefined) lines.push(`    상세: ${indent(item.detail, '    ')}`);
    if (item.fix !== undefined) lines.push(`    조치: ${indent(item.fix, '    ')}`);
    lines.push('');
  }
  const summary = summarize(report, duration);
  lines.push(
    '요약',
    '────────────────────────────────────────',
    `  ${summaryLine(summary)}`,
    `  전체 ${summary.total}개 · ${summary.duration}ms`,
  );
  return lines.join('\n').trimEnd();
}

export function formatDoctorJson(report: DoctorItem[], duration: number): string {
  const summary = summarize(report, duration);
  return JSON.stringify({ results: report, summary, exitCode: summary.failed > 0 ? 1 : 0 }, null, 2);
}

export function formatDoctorReport(
  report: DoctorItem[],
  mode: 'default' | 'status' | 'verbose',
  json: boolean,
  duration: number,
): string {
  if (json) return formatDoctorJson(report, duration);
  switch (mode) {
    case 'default':
      return formatDoctorDefault(report, duration);
    case 'status':
      return formatDoctorStatus(report, duration);
    case 'verbose':
      return formatDoctorVerbose(report, duration);
    default:
      return assertNever(mode);
  }
}

function summarize(report: DoctorItem[], duration: number): DoctorSummary {
  return {
    total: report.length,
    passed: report.filter((item) => item.status === 'ok').length,
    failed: report.filter((item) => item.status === 'error').length,
    warnings: report.filter((item) => item.status === 'warning').length,
    duration: Math.round(duration),
  };
}

function header(): string {
  return 'Nunch Skills Doctor';
}

function label(name: string): string {
  return labels[name] ?? name;
}

function indent(value: string, prefix = '   '): string {
  return value.replaceAll('\n', `\n${prefix}`);
}

function summaryLine(summary: DoctorSummary): string {
  return `전체 ${summary.total}개 항목 중 ${summary.passed} passed, ${summary.failed} failed, ${summary.warnings} warnings`;
}

function assertNever(value: never): never {
  throw new TypeError(`unexpected doctor mode: ${String(value)}`);
}
