import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CodexBackend } from '../src/codex.ts';
import type { CommandRunner } from '../src/codex-schema.ts';
import { CommandError } from '../src/command.ts';

test('pins a missing marketplace and installs a plugin by verified identity', async () => {
  // Given
  const runner = new RecordingRunner([
    '{"marketplaces":[]}',
    '{}',
    '{"pluginId":"git-tools@nunch-skills","name":"git-tools","version":"1.0.0"}',
  ]);
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
  });

  // When
  await backend.ensureMarketplace();
  await backend.installPlugin('git-tools');

  // Then
  assert.deepEqual(runner.calls, [
    ['codex', 'plugin', 'marketplace', 'list', '--json'],
    ['codex', 'plugin', 'marketplace', 'add', 'nunch-dev/nunch-skills', '--ref', 'a'.repeat(40), '--json'],
    ['codex', 'plugin', 'add', 'git-tools@nunch-skills', '--json'],
  ]);
});

test('lists only installed marketplace plugins', async () => {
  // Given
  const runner = new RecordingRunner([
    JSON.stringify({
      installed: [
        {
          pluginId: 'git-tools@nunch-skills',
          name: 'git-tools',
          version: '1.0.0',
          installed: true,
          marketplaceName: 'nunch-skills',
          source: { path: '/tmp/git-tools' },
        },
        {
          pluginId: 'other@elsewhere',
          name: 'other',
          version: '1.0.0',
          installed: true,
          marketplaceName: 'elsewhere',
          source: { path: '/tmp/other' },
        },
      ],
    }),
  ]);
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
  });

  // When
  const installed = await backend.listInstalled();

  // Then
  assert.deepEqual(installed, ['git-tools']);
});

test('trust registration fails closed and explains the development checkout cause', async () => {
  // Given: no verified release manifest exists (development checkout).
  const backend = new CodexBackend({
    runner: new RecordingRunner([]),
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
    configPath: '/tmp/nonexistent-config.toml',
  });

  // When
  const failure = await backend.ensureTrust().catch((error: unknown) => error);

  // Then
  assert.ok(failure instanceof CommandError);
  assert.match((failure as Error).message, /개발 체크아웃|development checkout/);
});

test('removes current and legacy installer hook trust during bundle migration', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'nunch-trust-migration-'));
  const configPath = join(root, 'config.toml');
  const hash = `sha256:${'a'.repeat(64)}`;
  await writeFile(
    configPath,
    `model = "gpt"\n\n[hooks.state."nch-installer@nunch-skills:hooks/hooks.json:session_start:0:0"]\ntrusted_hash = "${hash}"\n\n[hooks.state."nunch-skills@nunch-skills:hooks/hooks.json:session_start:0:0"]\ntrusted_hash = "${hash}"\n`,
  );
  const backend = new CodexBackend({
    runner: new RecordingRunner([]),
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
    configPath,
  });

  // When
  await backend.removeTrust();

  // Then
  assert.equal(await readFile(configPath, 'utf8'), 'model = "gpt"\n');
});

test('rejects an existing marketplace pinned to another commit', async () => {
  // Given
  const runner = new RecordingRunner([
    '{"marketplaces":[{"name":"nunch-skills","root":"/tmp/nch-marketplace"}]}',
    'https://github.com/nunch-dev/nunch-skills.git',
    '',
    `${'b'.repeat(40)}\n`,
  ]);
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
  });

  // When / Then
  await assert.rejects(() => backend.ensureMarketplace(), /commit/);
});

test('refuses to repin an existing marketplace from another Git remote', async () => {
  // Given
  const runner = new MarketplaceRunner('https://github.com/attacker/nunch-skills.git', '');
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
    allowRepin: true,
  });

  // When / Then
  await assert.rejects(() => backend.ensureMarketplace(), /source/);
});

test('refuses to repin a marketplace with local changes', async () => {
  // Given
  const runner = new MarketplaceRunner('https://github.com/nunch-dev/nunch-skills.git', ' M local-file');
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
    allowRepin: true,
  });

  // When / Then
  await assert.rejects(() => backend.ensureMarketplace(), /local changes/);
});

test('rejects release verification without a verified manifest', async () => {
  // Given
  const runner = new RecordingRunner([
    '{"marketplaces":[{"name":"nunch-skills","root":"/tmp/nch-marketplace"}]}',
    `${'a'.repeat(40)}\n`,
  ]);
  const backend = new CodexBackend({
    runner,
    codexCommand: 'codex',
    marketplace: 'nunch-skills',
    releaseCommit: 'a'.repeat(40),
  });

  // When / Then
  await assert.rejects(() => backend.verifyRelease(), /manifest/);
});

class RecordingRunner implements CommandRunner {
  calls: string[][] = [];
  outputs: string[];

  constructor(outputs: string[]) {
    this.outputs = outputs;
  }

  async run(command: string, args: string[]): Promise<string> {
    this.calls.push([command, ...args]);
    const output = this.outputs.shift();
    if (output === undefined) throw new Error('missing test output');
    return output;
  }
}

class MarketplaceRunner implements CommandRunner {
  remote: string;
  status: string;

  constructor(remote: string, status: string) {
    this.remote = remote;
    this.status = status;
  }

  async run(command: string, args: string[]): Promise<string> {
    if (command === 'codex') {
      if (args[1] === 'marketplace' && args[2] === 'list') {
        return '{"marketplaces":[{"name":"nunch-skills","root":"/tmp/nch-marketplace"}]}';
      }
      return '{}';
    }
    if (args[2] === 'remote') return this.remote;
    if (args[2] === 'status') return this.status;
    if (args[2] === 'rev-parse') return `${'b'.repeat(40)}\n`;
    return '{}';
  }
}
