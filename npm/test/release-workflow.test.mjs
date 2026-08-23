import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release workflow writes portable checksum paths", async () => {
  // Given
  const workflow = await readFile(
    new URL("../../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );

  // When / Then
  assert.match(
    workflow,
    /- name: Generate portable checksums\n\s+working-directory: release-artifacts\n\s+run: sha256sum \* > SHA256SUMS/
  );
  assert.doesNotMatch(workflow, /sha256sum "\$GITHUB_WORKSPACE\/release-artifacts"\/\*/);
});
