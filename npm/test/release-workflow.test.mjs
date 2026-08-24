import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function readWorkflow(name) {
  return readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
}

test('release workflow writes portable checksum paths', async () => {
  // Given
  const workflow = await readWorkflow('release.yml');

  // When / Then
  assert.match(
    workflow,
    /- name: Generate portable checksums\n\s+working-directory: release-artifacts\n\s+run: sha256sum \.\/\* > SHA256SUMS/,
  );
  assert.doesNotMatch(workflow, /sha256sum "\$GITHUB_WORKSPACE\/release-artifacts"\/\*/);
});

test('npm publish workflow verifies a GitHub Release before OIDC publishing', async () => {
  // Given
  const workflow = await readWorkflow('publish-npm.yml');

  // When / Then
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /gh release download/);
  assert.match(workflow, /sha256sum -c SHA256SUMS/);
  assert.match(workflow, /release-manifest\.mjs/);
  assert.match(workflow, /npm publish "\$tarball" --dry-run --access public --tag latest/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_BOOTSTRAP_TOKEN/);
  assert.match(workflow, /--access public --tag latest --provenance/);
  assert.doesNotMatch(workflow, /types: \[published\]/);
});

test('development workflows use the pinned pnpm toolchain', async () => {
  // Given
  const workflows = await Promise.all([readWorkflow('release.yml'), readWorkflow('sync-upstreams.yml')]);

  // When / Then
  for (const workflow of workflows) {
    assert.match(workflow, /pnpm\/action-setup@f520eceda224fe1a4aed5a2a27a194379a409996/);
    assert.match(workflow, /cache: pnpm/);
    assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/);
  }
});
