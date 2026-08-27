import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { parseConfig } from '../src/config.ts';
import { syncConfigured } from '../src/sync.ts';

const execFileAsync = promisify(execFile);

test('syncs managed paths and preserves the manifest format', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'upstream-sync-test-'));
  const remote = await createRemote();
  await write(root, 'plugins/example/skills/stale.md', 'stale\n');
  await write(root, 'plugins/example/.codex-plugin/plugin.json', '{"name":"example","version":"2.3.2"}');
  await write(root, 'upstreams.json', configFor(remote, 'main'));

  // When
  await syncConfigured({ root, configPath: join(root, 'upstreams.json'), lockPath: join(root, 'lock.json') });

  // Then
  assert.equal(
    await readFile(join(root, 'plugins/example/skills/SKILL.md'), 'utf8'),
    '---\nname: example\n---\nupstream\n',
  );
  assert.match(
    await readFile(join(root, 'plugins/example/.codex-plugin/plugin.json'), 'utf8'),
    /"version":"2\.4\.0\+upstream\.[0-9a-f]{12}"/,
  );
  assert.match(await readFile(join(root, 'lock.json'), 'utf8'), /"example": "[0-9a-f]{40}"/);
});

test('propagates a version into a copied manifest and the repository marketplace', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'upstream-sync-test-'));
  const remote = await createRemote();
  await write(root, 'plugins/example/.codex-plugin/plugin.json', '{"version":"2.3.2","legacy":true}');
  await write(
    root,
    '.claude-plugin/marketplace.json',
    '{"name":"fixtures","plugins":[{"name":"example","version":"2.3.2","source":"./plugins/example"}]}',
  );
  await write(
    root,
    'upstreams.json',
    JSON.stringify({
      upstreams: [
        {
          name: 'example',
          repository: remote,
          ref: 'main',
          copies: [{ source: 'manifest', destination: 'plugins/example/.codex-plugin' }],
          version: {
            source: 'manifest/plugin.json',
            targets: ['plugins/example/.codex-plugin/plugin.json'],
            marketplaceTargets: ['.claude-plugin/marketplace.json'],
            appendCommit: true,
          },
        },
      ],
    }),
  );

  // When
  await syncConfigured({ root, configPath: join(root, 'upstreams.json'), lockPath: join(root, 'lock.json') });

  // Then
  const manifest = await readFile(join(root, 'plugins/example/.codex-plugin/plugin.json'), 'utf8');
  assert.match(manifest, /^\{"version":"2\.4\.0\+upstream\.[0-9a-f]{12}"\}$/);
  assert.match(
    await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'),
    /"name": "example",\n {6}"version": "2\.4\.0\+upstream\.[0-9a-f]{12}"/,
  );
});

test('preserves the workspace when preflight fails', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'upstream-sync-test-'));
  const remote = await createRemote();
  await write(root, 'plugins/example/skills/SKILL.md', 'local\n');
  await write(root, 'upstreams.json', configFor(remote, 'missing-ref'));

  // When
  await assert.rejects(() =>
    syncConfigured({ root, configPath: join(root, 'upstreams.json'), lockPath: join(root, 'lock.json') }),
  );

  // Then
  assert.equal(await readFile(join(root, 'plugins/example/skills/SKILL.md'), 'utf8'), 'local\n');
});

test('rejects a destination outside the workspace root', () => {
  // Given
  const config = JSON.parse(configFor('https://example.test/repository.git', 'main'));
  config.upstreams[0].copies[0].destination = '../outside';

  // When / Then
  assert.throws(() => parseConfig(config), /destination/);
});

test('recovers a journal-less preparation directory before syncing', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'upstream-sync-test-'));
  const remote = await createRemote();
  await write(root, 'plugins/example/.codex-plugin/plugin.json', '{"name":"example","version":"2.3.2"}');
  await write(root, 'upstreams.json', configFor(remote, 'main'));
  await mkdir(join(root, '.upstream-sync-transaction'));
  const stalePreparation = join(root, '.upstream-sync-transaction.prepare-999999-stale');
  await mkdir(stalePreparation);

  // When / Then
  await assert.doesNotReject(() =>
    syncConfigured({ root, configPath: join(root, 'upstreams.json'), lockPath: join(root, 'lock.json') }),
  );
  await assert.rejects(() => access(stalePreparation), /ENOENT/);
});

async function createRemote(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'upstream-remote-'));
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: directory });
  await execFileAsync('git', ['config', 'user.name', 'Upstream Fixture'], { cwd: directory });
  await execFileAsync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: directory });
  await write(directory, 'content/SKILL.md', '---\nname: example\ndisable-model-invocation: true\n---\nupstream\n');
  await write(directory, 'manifest/plugin.json', '{"version":"2.4.0"}');
  await execFileAsync('git', ['add', '.'], { cwd: directory });
  await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: directory });
  return directory;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function configFor(repository: string, ref: string): string {
  return JSON.stringify({
    upstreams: [
      {
        name: 'example',
        repository,
        ref,
        copies: [
          {
            source: 'content',
            destination: 'plugins/example/skills',
            removeFrontmatter: ['disable-model-invocation'],
          },
        ],
        version: {
          source: 'manifest/plugin.json',
          targets: ['plugins/example/.codex-plugin/plugin.json'],
          appendCommit: true,
        },
      },
    ],
  });
}
