#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  legalComments: 'none',
  minifyWhitespace: true,
  minify: false,
  platform: 'node',
  sourcemap: false,
  target: 'node22',
};

const artifacts = [
  'npm/bin/nunch-skills.mjs',
  'plugins/nunch-skills/runtime/nch-installer.mjs',
  'tools/upstream-sync/dist/upstream-sync.mjs',
];

await Promise.all([
  build({
    ...shared,
    entryPoints: ['npm/src/entry.ts'],
    outfile: 'npm/bin/nunch-skills.mjs',
    banner: { js: '#!/usr/bin/env node' },
  }),
  build({
    ...shared,
    entryPoints: ['plugins/nunch-skills/runtime/src/entry.ts'],
    outfile: 'plugins/nunch-skills/runtime/nch-installer.mjs',
    banner: { js: '#!/usr/bin/env node' },
  }),
  build({
    ...shared,
    entryPoints: ['tools/upstream-sync/src/cli.ts'],
    outfile: 'tools/upstream-sync/dist/upstream-sync.mjs',
    banner: { js: '#!/usr/bin/env node' },
  }),
]);

for (const artifact of artifacts) {
  const content = await readFile(artifact, 'utf8');
  await writeFile(artifact, content.replace(/^[ \t]+$/gm, ''));
}
