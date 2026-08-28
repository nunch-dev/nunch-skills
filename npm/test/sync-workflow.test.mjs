import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('upstream sync ignores merged pull requests when selecting a pull request to update', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/sync-upstreams.yml', import.meta.url), 'utf8');

  assert.doesNotMatch(workflow, /gh pr view "\$SYNC_BRANCH"/);
  assert.match(workflow, /gh pr list[\s\S]*?--state open[\s\S]*?--jq '\.\[0\]\.number'/);
  assert.match(workflow, /gh pr edit "\$pr_number"/);
});
