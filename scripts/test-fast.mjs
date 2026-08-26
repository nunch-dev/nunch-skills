import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function testFastGroups() {
  return [
    { name: 'package-surface', args: ['--test'], patterns: ['npm/test/*.test.mjs'] },
    {
      name: 'typescript-runtime',
      args: ['--experimental-strip-types', '--test'],
      patterns: ['npm/test/*.test.ts', 'plugins/nunch-skills-manager/runtime/test/*.test.ts'],
    },
    {
      name: 'upstream-sync',
      args: ['--experimental-strip-types', '--test'],
      patterns: ['tools/upstream-sync/test/*.test.ts'],
    },
  ];
}

const spawnTestGroup = (group) =>
  new Promise((resolve, reject) => {
    const files = group.patterns.flatMap((pattern) => globSync(pattern)).sort();
    const child = spawn(process.execPath, [...group.args, ...files], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });

export async function runTestFast(runner = spawnTestGroup) {
  const groups = testFastGroups();
  process.stdout.write(`[test:fast] ${groups.map((group) => group.name).join(', ')}\n`);
  const exits = await Promise.all(groups.map(runner));
  return exits.every((exit) => exit === 0) ? 0 : 1;
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  process.exitCode = await runTestFast();
}
