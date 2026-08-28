import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { runVerifiedUpdate } from '../src/release.ts';

test('checks registry metadata before downloading the latest tarball', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'nunch-npm-view-'));
  const logPath = join(root, 'npm-args.json');
  const executable = process.platform === 'win32' ? join(root, 'npm.cmd') : join(root, 'npm');
  const script =
    process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "%~dp0\\npm-fake.mjs" %*\r\n`
      : `#!${process.execPath}\nimport './npm-fake.mjs';\n`;
  await writeFile(
    join(root, 'npm-fake.mjs'),
    `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nif (process.argv[2] === 'view') process.stdout.write(JSON.stringify('1.2.3'));\nelse process.exitCode = 17;\n`,
  );
  await writeFile(executable, script);
  await chmod(executable, 0o755);
  const previousPath = process.env['PATH'];
  process.env['PATH'] = `${root}${delimiter}${previousPath ?? ''}`;

  try {
    // When
    const result = await runVerifiedUpdate('1.2.3');

    // Then
    assert.equal(result, 'up-to-date');
    const calls = (await readFile(logPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(calls, [['view', '@nunch-dev/skills@latest', 'version', '--json']]);
  } finally {
    if (previousPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = previousPath;
  }
});
