import { resolve } from 'node:path';

import { syncConfigured } from './sync.ts';

async function main(argv: string[]): Promise<number> {
  const values = parseArguments(argv);
  try {
    await syncConfigured(values);
    process.stdout.write(`synchronized upstreams from ${values.configPath}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`upstream sync: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  }
}

function parseArguments(argv: string[]): { root: string; configPath: string; lockPath: string } {
  let root = '.';
  let configPath = '';
  let lockPath = '';
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`missing value for ${flag ?? 'argument'}`);
    if (flag === '-root') root = value;
    else if (flag === '-config') configPath = value;
    else if (flag === '-lock') lockPath = value;
    else throw new Error(`unknown argument ${flag}`);
    index += 1;
  }
  const absoluteRoot = resolve(root);
  return {
    root: absoluteRoot,
    configPath: configPath.length === 0 ? resolve(absoluteRoot, '.github/upstreams.json') : resolve(configPath),
    lockPath: lockPath.length === 0 ? resolve(absoluteRoot, '.github/upstreams.lock.json') : resolve(lockPath),
  };
}

process.exitCode = await main(process.argv.slice(2));
