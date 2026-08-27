import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { extname, win32 } from 'node:path';
import { promisify } from 'node:util';

import type { CommandRunner } from './codex-schema.ts';

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  name = 'CommandError';
}

type CommandOptions = {
  platform?: NodeJS.Platform;
  pathEnv?: string;
  comSpec?: string;
  signal?: AbortSignal;
  timeout?: number;
};

type CommandInvocation = { file: string; args: string[] };

function resolveWindowsCommand(command: string, pathEnv: string): string {
  if (/[/\\]/.test(command) || extname(command).length > 0) return command;
  for (const dir of pathEnv.split(';')) {
    for (const extension of ['.exe', '.cmd', '.bat']) {
      const candidate = win32.join(dir, command + extension);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch (error) {
        if (error instanceof Error) continue;
        throw error;
      }
    }
  }
  throw new CommandError(`command not found: ${command}`);
}

export function resolveCommandInvocation(
  command: string,
  args: string[],
  options: CommandOptions = {},
): CommandInvocation {
  if ((options.platform ?? process.platform) !== 'win32') return { file: command, args };
  const file = resolveWindowsCommand(command, options.pathEnv ?? process.env['PATH'] ?? '');
  const extension = extname(file).toLowerCase();
  if (extension !== '.cmd' && extension !== '.bat') return { file, args };
  return {
    file: options.comSpec ?? process.env['ComSpec'] ?? 'cmd.exe',
    args: ['/d', '/s', '/c', file, ...args],
  };
}

export async function execCommand(command: string, args: string[], options: CommandOptions = {}) {
  const invocation = resolveCommandInvocation(command, args, options);
  return execFileAsync(invocation.file, invocation.args, {
    encoding: 'utf8',
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
}

export class ExecRunner implements CommandRunner {
  private options: CommandOptions;

  constructor(override: CommandOptions = {}) {
    this.options = override;
  }

  async run(command: string, args: string[], signal?: AbortSignal): Promise<string> {
    try {
      const result = await execCommand(command, args, {
        ...this.options,
        ...(signal === undefined ? {} : { signal }),
      });
      return result.stdout;
    } catch (error) {
      throw new CommandError(`command failed: ${command}`, { cause: error });
    }
  }
}
