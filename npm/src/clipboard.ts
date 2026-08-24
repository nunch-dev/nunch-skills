import { spawn } from 'node:child_process';

type ClipboardCommand = { command: string; args: string[] };

export function clipboardCommand(platform: NodeJS.Platform): ClipboardCommand {
  switch (platform) {
    case 'darwin':
      return { command: 'pbcopy', args: [] };
    case 'win32':
      return { command: 'clip', args: [] };
    default:
      return { command: 'wl-copy', args: [] };
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  const { command, args } = clipboardCommand(process.platform);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    child.once('error', reject);
    child.stdin.end(text);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new ClipboardError(command, code));
    });
  });
}

class ClipboardError extends Error {
  name = 'ClipboardError';

  constructor(command: string, code: number | null) {
    super(`${command} exited with ${code === null ? 'an unknown signal' : `code ${code}`}`);
  }
}
