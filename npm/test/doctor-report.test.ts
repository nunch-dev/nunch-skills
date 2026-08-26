import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDoctorDefault,
  formatDoctorJson,
  formatDoctorStatus,
  formatDoctorVerbose,
} from '../src/doctor-output.ts';

const report = [
  { name: 'Node.js', status: 'ok' as const, detail: 'v24.0.0' },
  { name: 'integrity', status: 'error' as const, detail: 'digest mismatch', fix: 'reinstall' },
  { name: 'dependencies', status: 'warning' as const, detail: 'Git missing', fix: 'install Git' },
];

test('default doctor output shows only actionable issues', () => {
  // Given / When
  const output = formatDoctorDefault(report, 12);

  // Then
  assert.doesNotMatch(output, /v24\.0\.0/);
  assert.match(output, /digest mismatch/);
  assert.match(output, /Git missing/);
});

test('default doctor output concludes usability when only warnings remain', () => {
  // Given: a report with warnings but no errors.
  const warningOnly = [
    { name: 'Node.js', status: 'ok' as const, detail: 'v24.0.0' },
    { name: 'integrity', status: 'warning' as const, detail: 'manifest missing', fix: 'reinstall' },
  ];

  // When
  const output = formatDoctorDefault(warningOnly, 12);

  // Then
  assert.match(output, /설치는 정상 동작합니다/);
});
test('status doctor output is a compact dashboard', () => {
  // Given / When
  const output = formatDoctorStatus(report, 12);

  // Then
  assert.match(output, /Node\.js/);
  assert.match(output, /전체 3개 항목 중 1 passed/);
  assert.match(output, /1 failed/);
});

test('verbose doctor output includes every check and remediation', () => {
  // Given / When
  const output = formatDoctorVerbose(report, 12);

  // Then
  for (const value of ['v24.0.0', 'digest mismatch', 'reinstall', 'Git missing', 'install Git']) {
    assert.match(output, new RegExp(value));
  }
});

test('JSON doctor output exposes results, summary, duration, and exit code', () => {
  // Given / When
  const parsed: unknown = JSON.parse(formatDoctorJson(report, 12));

  // Then
  assert.deepEqual(parsed, {
    results: report,
    summary: { total: 3, passed: 1, failed: 1, warnings: 1, duration: 12 },
    exitCode: 1,
  });
});
