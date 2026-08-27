import assert from 'node:assert/strict';
import test from 'node:test';

import { type CliExecution, type PublicCliDependencies, runPublicCli } from '../src/public-cli.ts';

test('shows command help without requiring a TTY', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli({ argv: [], stdinTty: false, stdoutTty: false }, dependencies);

  // Then
  assert.equal(code, 0);
  assert.equal(dependencies.output.length > 0, true);
  assert.deepEqual(dependencies.executions, []);
});

test('runs the interactive install command with selected platform and plugins', async () => {
  // Given
  const dependencies = fakeDependencies();
  dependencies.choosePlatform = async () => 'both';
  dependencies.choosePlugins = async () => ['git-tools'];

  // When
  const code = await runPublicCli({ argv: ['install'], stdinTty: true, stdoutTty: true }, dependencies);

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.executions, [
    { operation: 'install', plugins: ['git-tools'], targets: ['codex', 'claude'] },
  ]);
});

test('setup aliases the interactive install command', async () => {
  // Given
  const dependencies = fakeDependencies();
  dependencies.choosePlatform = async () => 'codex';

  // When
  const code = await runPublicCli({ argv: ['setup'], stdinTty: true, stdoutTty: true }, dependencies);

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.executions, [{ operation: 'install', plugins: [], targets: ['codex'] }]);
});

test('runs non-interactive install when every required option is explicit', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli(
    {
      argv: ['install', '--no-tui', '--platform=claude', '--plugins=git-tools,humanize-korean'],
      stdinTty: false,
      stdoutTty: false,
    },
    dependencies,
  );

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.executions, [
    { operation: 'install', plugins: ['git-tools', 'humanize-korean'], targets: ['claude'] },
  ]);
});

test('rejects non-interactive install with incomplete options', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli(
    { argv: ['install', '--no-tui', '--platform=codex'], stdinTty: false, stdoutTty: false },
    dependencies,
  );

  // Then
  assert.equal(code, 2);
  assert.deepEqual(dependencies.executions, []);
});

test('runs doctor without a TTY and preserves output mode', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli(
    { argv: ['doctor', '--verbose', '--platform=codex'], stdinTty: false, stdoutTty: false },
    dependencies,
  );

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.executions, [
    {
      operation: 'doctor',
      plugins: [],
      targets: ['codex'],
      doctor: { mode: 'verbose', json: false },
    },
  ]);
});

test('JSON doctor output takes precedence over terminal rendering', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli(
    { argv: ['doctor', '--status', '--json'], stdinTty: false, stdoutTty: false },
    dependencies,
  );

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.executions, [
    {
      operation: 'doctor',
      plugins: [],
      targets: ['codex', 'claude'],
      doctor: { mode: 'status', json: true },
    },
  ]);
});

type FakeDependencies = PublicCliDependencies & { executions: CliExecution[]; output: string[] };

function fakeDependencies(): FakeDependencies {
  const executions: CliExecution[] = [];
  const output: string[] = [];
  return {
    executions,
    output,
    choosePlatform: async () => 'codex',
    choosePlugins: async () => [],
    availablePlugins: async () => ['git-tools', 'humanize-korean'],
    installedPlugins: async () => ['nch-installer', 'git-tools'],
    execute: async (execution) => {
      executions.push(execution);
    },
    confirm: async () => true,
    configureTelemetry: async () => undefined,
    writeError: (message) => output.push(message),
    writeOutput: (message) => output.push(message),
  };
}
