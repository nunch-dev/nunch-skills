import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import type { CommandRunner } from './codex-schema.ts';

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  name = 'CommandError';
}

type PlatformOverride = { platform?: NodeJS.Platform };

function resolveWindowsCommand(command: string, pathEnv: string): string {
  if (/[/\\]/.test(command) || command.endsWith('.exe')) return command;
  for (const dir of pathEnv.split(delimiter)) {
    for (const extension of ['.cmd', '.bat', '.exe']) {
      const candidate = join(dir, command + extension);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  throw new CommandError(`command not found: ${command}`);
}

export class ExecRunner implements CommandRunner {
  private readonly platform: NodeJS.Platform;

  constructor(override: PlatformOverride = {}) {
    this.platform = override.platform ?? process.platform;
  }

  async run(command: string, args: string[], signal?: AbortSignal): Promise<string> {
    try {
      const executable =
        this.platform === 'win32' ? resolveWindowsCommand(command, process.env['PATH'] ?? '') : command;
      const result = await execFileAsync(executable, args, { encoding: 'utf8', signal });
      return result.stdout;
    } catch (error) {
      throw new CommandError(`command failed: ${command}`, { cause: error });
    }
  }
}
