import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDoctorReport } from '../src/clack-ui.ts';

test('renders every doctor result with its detail and remediation', () => {
  // Given
  const report = [
    { name: 'dependencies', status: 'warning' as const, detail: 'detail-a', fix: 'fix-a' },
    { name: 'integrity', status: 'error' as const, detail: 'detail-b', fix: 'fix-b' },
    { name: 'transaction', status: 'ok' as const, detail: 'detail-c' },
  ];

  // When
  const output = formatDoctorReport(report);

  // Then
  for (const detail of ['detail-a', 'detail-b', 'detail-c', 'fix-a', 'fix-b']) assert.match(output, new RegExp(detail));
  assert.match(output, /1 passed, 1 failed, 1 warning/);
});
