import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BINARY_NAMES, verifyReproducibleBuild } from "../scripts/repro-build.mjs";

test("reproducible build rejects output that differs from committed release binaries", async (context) => {
  // Given
  const repository = await mkdtemp(join(tmpdir(), "nunch-skills-repro-build-test-"));
  context.after(() => rm(repository, { recursive: true, force: true }));
  const buildDirectory = join(repository, "plugins/nunch-skills-manager/updater");
  const binaryDirectory = join(repository, "plugins/nunch-skills-manager/bin");
  await mkdir(buildDirectory, { recursive: true });
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(join(repository, "package.json"), '{"version":"1.2.3"}\n');
  await writeFile(
    join(buildDirectory, "build.sh"),
    `#!/bin/sh\nset -eu\nmkdir -p "$1"\nfor name in ${BINARY_NAMES.join(" ")}; do printf 'built\\n' > "$1/$name"; done\n`
  );
  for (const name of BINARY_NAMES) {
    await writeFile(join(binaryDirectory, name), "committed\n");
  }

  // When / Then
  await assert.rejects(
    verifyReproducibleBuild(repository),
    /built binary differs from committed release artifact/
  );
});
