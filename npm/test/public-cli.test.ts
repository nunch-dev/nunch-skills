import assert from 'node:assert/strict';
import test from 'node:test';

import { type PublicCliDependencies, runPublicCli } from '../src/public-cli.ts';

test('rejects non-TTY execution without mutation', async () => {
  // Given
  const dependencies = fakeDependencies();

  // When
  const code = await runPublicCli({ argv: [], stdinTty: false, stdoutTty: true }, dependencies);

  // Then
  assert.equal(code, 2);
  assert.deepEqual(dependencies.operations, []);
});

test('runs selected install plugins from the interactive menu', async () => {
  // Given
  const dependencies = fakeDependencies();
  dependencies.chooseOperation = async () => 'install';
  dependencies.choosePlugins = async () => ['git-tools'];

  // When
  const code = await runPublicCli({ argv: [], stdinTty: true, stdoutTty: true }, dependencies);

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.operations, [{ kind: 'install', plugins: ['git-tools'] }]);
});

test('installs the manager when no leaf skill is selected', async () => {
  // Given
  const dependencies = fakeDependencies();
  dependencies.chooseOperation = async () => 'install';
  dependencies.choosePlugins = async () => [];

  // When
  const code = await runPublicCli({ argv: [], stdinTty: true, stdoutTty: true }, dependencies);

  // Then
  assert.equal(code, 0);
  assert.deepEqual(dependencies.operations, [{ kind: 'install', plugins: [] }]);
});

type RecordedOperation = { kind: 'install' | 'update' | 'uninstall' | 'doctor'; plugins: string[] };

function fakeDependencies(): PublicCliDependencies & { operations: RecordedOperation[] } {
  const operations: RecordedOperation[] = [];
  return {
    operations,
    chooseOperation: async () => 'cancel',
    choosePlugins: async () => [],
    availablePlugins: async () => ['git-tools'],
    installedPlugins: async () => ['nunch-skills-manager', 'git-tools'],
    execute: async (kind, plugins) => {
      operations.push({ kind, plugins });
    },
    confirm: async () => true,
    writeError: () => undefined,
  };
}
