import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ReleaseManifest } from '../src/release-manifest.ts';
import { hookTrustHash, TrustEditor, verifyInstalledManagerPayload } from '../src/trust.ts';

const trustId = 'nunch-skills-manager@nunch-skills:hooks/hooks.json:session_start:0:0';

test('hashes the canonical platform hook identity', () => {
  // Given
  const identity = {
    event_name: 'session_start',
    hooks: [
      {
        async: false,
        command: 'node manager.mjs hook',
        statusMessage: 'Checking',
        timeout: 15,
        type: 'command',
      },
    ],
    matcher: '^startup$',
  };

  // When
  const hash = hookTrustHash(identity);

  // Then
  assert.equal(hash, `sha256:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`);
});

test('upserts and removes a trust section with compare-and-swap', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'trust-editor-'));
  const path = join(root, 'config.toml');
  await writeFile(path, 'model = "gpt"\n');
  const editor = new TrustEditor(path);
  const hash = `sha256:${'a'.repeat(64)}`;

  // When
  await editor.upsert(trustId, '', hash);
  await editor.remove(trustId, hash);

  // Then
  assert.equal(await readFile(path, 'utf8'), 'model = "gpt"\n');
  assert.equal(
    await readFile(`${path}.bak`, 'utf8'),
    `model = "gpt"\n\n[hooks.state."${trustId}"]\ntrusted_hash = "${hash}"\n`,
  );
});

test('rejects trust when the installed manager payload is tampered', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'manager-payload-'));
  const hook = `${JSON.stringify({
    hooks: {
      SessionStart: [
        {
          matcher: '^startup$',
          hooks: [
            {
              type: 'command',
              command: `node "\${PLUGIN_ROOT}/runtime/nunch-skills-manager.mjs" hook session-start`,
              commandWindows: 'powershell manager.ps1',
              timeout: 15,
              statusMessage: 'Checking nunch-skills updates',
            },
          ],
        },
      ],
    },
  })}\n`;
  const contents = new Map([
    ['.codex-plugin/plugin.json', 'plugin\n'],
    ['hooks/hooks.json', hook],
    ['runtime/nunch-skills-manager.mjs', 'runtime\n'],
    ['scripts/node-dispatch.ps1', 'script\n'],
  ]);
  for (const [path, content] of contents) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
  const releaseFile = (path: string, relative: string) => ({
    path: `plugins/nunch-skills-manager/${path}`,
    sha256: createHash('sha256')
      .update(contents.get(relative) ?? '')
      .digest('hex'),
  });
  const manifest: ReleaseManifest = {
    schemaVersion: 2,
    npm: { name: '@nunch-dev/skills', version: '1.2.3', files: [] },
    git: { tag: 'v1.2.3', commit: 'a'.repeat(40), contentSha256: 'b'.repeat(64) },
    plugins: [{ name: 'nunch-skills-manager', version: '1.2.3' }],
    marketplace: { path: '.agents/plugins/marketplace.json', sha256: 'c'.repeat(64) },
    plugin: releaseFile('.codex-plugin/plugin.json', '.codex-plugin/plugin.json'),
    hook: releaseFile('hooks/hooks.json', 'hooks/hooks.json'),
    scripts: [releaseFile('scripts/node-dispatch.ps1', 'scripts/node-dispatch.ps1')],
    runtime: releaseFile('runtime/nunch-skills-manager.mjs', 'runtime/nunch-skills-manager.mjs'),
  };
  await writeFile(join(root, 'runtime/nunch-skills-manager.mjs'), 'tampered\n');

  // When / Then
  await assert.rejects(() => verifyInstalledManagerPayload(root, manifest, 'darwin'), /digest/);
});

test('rejects invalid UTF-8 config without changing its bytes', async () => {
  // Given
  const root = await mkdtemp(join(tmpdir(), 'trust-editor-'));
  const path = join(root, 'config.toml');
  const invalid = Buffer.from([0xff, 0xfe, 0xfd]);
  await writeFile(path, invalid);
  const editor = new TrustEditor(path);

  // When / Then
  await assert.rejects(() => editor.upsert(trustId, '', `sha256:${'a'.repeat(64)}`), /UTF-8/);
  assert.deepEqual(await readFile(path), invalid);
});
