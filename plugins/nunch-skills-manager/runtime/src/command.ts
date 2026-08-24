import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CommandRunner } from './codex-schema.ts';

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  name = 'CommandError';
}

export class ExecRunner implements CommandRunner {
  async run(command: string, args: string[], signal?: AbortSignal): Promise<string> {
    try {
      const result = await execFileAsync(command, args, { encoding: 'utf8', signal });
      return result.stdout;
    } catch (error) {
      throw new CommandError(`command failed: ${command}`, { cause: error });
    }
  }
}
