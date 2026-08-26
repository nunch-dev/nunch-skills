import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

const MARKETPLACE = '.claude-plugin/marketplace.json';

test('claude marketplace versions match every plugin manifest', async () => {
  // Given
  const marketplace = JSON.parse(await readFile(new URL(MARKETPLACE, REPOSITORY_ROOT), 'utf8'));

  // When
  const comparisons = await Promise.all(
    marketplace.plugins.map(async (entry) => {
      const manifest = JSON.parse(
        await readFile(new URL(`${entry.source}/.claude-plugin/plugin.json`, REPOSITORY_ROOT), 'utf8'),
      );
      return { name: entry.name, marketplaceVersion: entry.version, manifestVersion: manifest.version };
    }),
  );

  // Then
  for (const { name, marketplaceVersion, manifestVersion } of comparisons) {
    assert.equal(marketplaceVersion, manifestVersion, `${name} version drift between marketplace and plugin manifest`);
  }
});
