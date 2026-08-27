import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dependencyNotice } from './dependency-notice.ts';
import { runVerifiedUpdate } from './release.ts';
import { writeAtomic } from './store.ts';
import { installedReleaseVersion, shouldCheck } from './update-policy.ts';

const updateStateSchema = z.strictObject({
  lastAttemptAt: z.number().optional(),
  lastStatus: z.enum(['started', 'success', 'failed']).optional(),
  pendingNotice: z.string().optional(),
  lastError: z.string().optional(),
});
type UpdateState = z.infer<typeof updateStateSchema>;

async function main(): Promise<number> {
  const [command, subcommand] = process.argv.slice(2);
  if (command === 'hook' && subcommand === 'session-start') return runHook();
  if (command === 'run') return runWorker();
  process.stderr.write('internal nch-installer command is invalid\n');
  return 2;
}

async function runHook(): Promise<number> {
  try {
    let state = await readUpdateState();
    const notice = state.pendingNotice ?? state.lastError;
    if (notice !== undefined) {
      state = { ...state, pendingNotice: undefined, lastError: undefined };
      await saveUpdateState(state);
    }
    if (
      process.env['NUNCH_SKILLS_AUTO_UPDATE_DISABLED'] === '1' ||
      !shouldCheck(state.lastStatus, state.lastAttemptAt, Date.now())
    ) {
      if (notice !== undefined) writeHookOutput(notice);
      return 0;
    }
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], {
      detached: true,
      env: process.env,
      stdio: 'ignore',
    });
    child.unref();
    await saveUpdateState({ lastAttemptAt: Date.now(), lastStatus: 'started' });
    writeHookOutput(
      notice === undefined
        ? 'Automatic update started in the background.'
        : `${notice} Automatic update started in the background.`,
    );
  } catch {
    await saveUpdateState({ lastAttemptAt: Date.now(), lastStatus: 'failed' }).catch((saveError: unknown) => {
      if (saveError instanceof Error) return;
    });
  }
  return 0;
}

async function runWorker(): Promise<number> {
  const codexHome = process.env['CODEX_HOME'] ?? join(homedir(), '.codex');
  try {
    const result = await runVerifiedUpdate(await installedReleaseVersion(codexHome));
    const dependencies = await dependencyNotice(process.env['NUNCH_SKILLS_CODEX_COMMAND'] ?? 'codex');
    const notices = [
      ...(result === 'updated' ? ['Automatic update completed. Start a new task to load it.'] : []),
      ...(dependencies === undefined ? [] : [dependencies]),
    ];
    await saveUpdateState({
      lastAttemptAt: Date.now(),
      lastStatus: 'success',
      ...(notices.length === 0 ? {} : { pendingNotice: notices.join(' ') }),
    });
    return 0;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    await saveUpdateState({
      lastAttemptAt: Date.now(),
      lastStatus: 'failed',
      lastError: 'Automatic update failed; installed plugins were kept unchanged.',
    });
    return 1;
  }
}

async function readUpdateState(): Promise<UpdateState> {
  try {
    const data = await import('node:fs/promises').then(({ readFile }) => readFile(updateStatePath(), 'utf8'));
    return updateStateSchema.parse(JSON.parse(data));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeHookOutput(message: string): void {
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `[nunch-skills] ${message}` } })}\n`,
  );
}

function saveUpdateState(state: UpdateState): Promise<void> {
  return writeAtomic(updateStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

function updateStatePath(): string {
  const codexHome = process.env['CODEX_HOME'] ?? join(homedir(), '.codex');
  return join(process.env['PLUGIN_DATA'] ?? join(codexHome, 'plugins', 'data', 'nch-installer'), 'auto-update.json');
}

process.exitCode = await main();
