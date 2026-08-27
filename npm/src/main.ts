import { join } from 'node:path';

import { ClaudeBackend } from '../../plugins/nunch-skills/runtime/src/claude.ts';
import { CodexBackend } from '../../plugins/nunch-skills/runtime/src/codex.ts';
import { ExecRunner } from '../../plugins/nunch-skills/runtime/src/command.ts';
import { runDoctor } from '../../plugins/nunch-skills/runtime/src/doctor.ts';
import { catalogPlugins } from './catalog.ts';
import { bindUiDependencies, ClackUi } from './clack-ui.ts';
import { formatDoctorReport } from './doctor-output.ts';
import { DoctorErrorsFound, executeOperation, type TargetRuntime } from './lifecycle-command.ts';
import { uninstallChoices } from './ownership.ts';
import { type CliExecution, type InstallTarget, runPublicCli } from './public-cli.ts';
import { claudeHomePath, codexHomePath, resolveRelease } from './runtime-config.ts';

class InstallationPreflightError extends Error {
  name = 'InstallationPreflightError';
}

function dataRootForTarget(target: InstallTarget): string {
  const home = target === 'codex' ? codexHomePath() : claudeHomePath();
  return join(home, 'plugins', 'data', 'nunch-skills');
}

export async function main(): Promise<number> {
  if (process.env['NUNCH_SKILLS_INTERNAL_OPERATION'] === 'update') return runInternalUpdate();
  const input = {
    argv: process.argv.slice(2),
    stdinTty: process.stdin.isTTY,
    stdoutTty: process.stdout.isTTY,
  };
  const ui = new ClackUi();
  const command = input.argv[0];
  const usesInteractiveUi = shouldUseInteractiveUi(input);
  if (usesInteractiveUi) ui.intro();
  const codexHome = codexHomePath();
  const codexDataRoot = join(codexHome, 'plugins', 'data', 'nunch-skills');

  const dependencies = bindUiDependencies(ui, {
    availablePlugins: async () => catalogPlugins().map((plugin) => plugin.name),
    installedPlugins: async (targets) => {
      const allPlugins = new Set<string>();
      for (const target of targets) {
        const plugins = await uninstallChoices(dataRootForTarget(target));
        for (const p of plugins) allPlugins.add(p);
      }
      return [...allPlugins].sort();
    },
    execute: async (execution: CliExecution) => {
      const { operation, plugins, targets } = execution;
      const showProgress = operation !== 'doctor';
      if (operation === 'install') {
        const preflight = await runDoctor(
          undefined,
          (name, status) => ui.progress({ operation, phase: 'verify', target: name, status }),
          targets,
        );
        const blockers = preflight.filter((item) => item.status === 'error');
        if (blockers.length > 0) {
          throw new InstallationPreflightError(
            `설치 사전 점검 실패: ${blockers.map((item) => item.name).join(', ')}. 해당 CLI를 설치한 뒤 다시 실행하세요.`,
          );
        }
      }
      if (showProgress) ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'started' });
      const release = await resolveRelease().catch((error: unknown) => {
        if (showProgress) ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'failed' });
        throw error;
      });
      if (showProgress) ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'completed' });

      const runtimes: TargetRuntime[] = [];
      for (const target of targets) {
        if (target === 'codex') {
          runtimes.push({
            target: 'codex',
            createBackend: (allowRepin) =>
              new CodexBackend({
                runner: new ExecRunner(),
                codexCommand: process.env['NUNCH_SKILLS_CODEX_COMMAND'] ?? 'codex',
                marketplace: 'nunch-skills',
                releaseCommit: release.commit,
                allowRepin,
                configPath: join(codexHome, 'config.toml'),
                ...(release.manifest === undefined ? {} : { releaseManifest: release.manifest }),
                snapshotPath: join(codexDataRoot, 'snapshots', 'foreground.json'),
              }),
            dataRoot: codexDataRoot,
            releaseCommit: release.commit,
            includeInstaller: true,
          });
        } else {
          const claudeDataRoot = dataRootForTarget('claude');
          runtimes.push({
            target: 'claude',
            createBackend: (allowRepin) =>
              new ClaudeBackend({
                runner: new ExecRunner(),
                claudeCommand: process.env['NUNCH_SKILLS_CLAUDE_COMMAND'] ?? 'claude',
                marketplace: 'nunch-skills',
                allowRepin,
              }),
            dataRoot: claudeDataRoot,
            releaseCommit: release.commit,
            includeInstaller: true,
          });
        }
      }

      const usePrefix = targets.length > 1;
      await executeOperation({
        operation,
        plugins,
        progress: (event, prefix) => {
          if (showProgress) ui.progress(event, usePrefix ? prefix : undefined);
        },
        runtimes,
        doctorReport: async (report, duration) => {
          const doctor: NonNullable<CliExecution['doctor']> = execution.doctor ?? { mode: 'default', json: false };
          process.stdout.write(`${formatDoctorReport(report, doctor.mode, doctor.json, duration)}\n`);
        },
      });
    },
  });
  try {
    const code = await runPublicCli(input, dependencies);
    if (code === 0 && usesInteractiveUi) ui.success(successMessage(command));
    return code;
  } catch (error) {
    if (error instanceof DoctorErrorsFound) return 1;
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    if (usesInteractiveUi) ui.error(message);
    else process.stderr.write(`${message}\n`);
    return 1;
  }
}

export function shouldUseInteractiveUi(input: { argv: string[]; stdinTty: boolean; stdoutTty: boolean }): boolean {
  if (
    !input.stdinTty ||
    !input.stdoutTty ||
    input.argv.some((argument) => argument === '--help' || argument === '-h')
  ) {
    return false;
  }
  const command = input.argv[0];
  return command === 'install' || command === 'setup' || command === 'update' || command === 'uninstall';
}

function successMessage(command: string | undefined): string {
  if (command === 'install' || command === 'setup') return '설치가 완료되었습니다';
  if (command === 'update') return '업데이트가 완료되었습니다';
  if (command === 'uninstall') return '삭제가 완료되었습니다';
  return '작업이 완료되었습니다';
}

async function runInternalUpdate(): Promise<number> {
  const codexHome = codexHomePath();
  const dataRoot = join(codexHome, 'plugins', 'data', 'nunch-skills');
  const release = await resolveRelease();
  const commit = release.commit;
  const runtime: TargetRuntime = {
    target: 'codex',
    createBackend: () =>
      new CodexBackend({
        runner: new ExecRunner(),
        codexCommand: process.env['NUNCH_SKILLS_CODEX_COMMAND'] ?? 'codex',
        marketplace: 'nunch-skills',
        releaseCommit: commit,
        allowRepin: true,
        configPath: join(codexHome, 'config.toml'),
        ...(release.manifest === undefined ? {} : { releaseManifest: release.manifest }),
        snapshotPath: join(dataRoot, 'snapshots', 'automatic.json'),
      }),
    dataRoot,
    releaseCommit: commit,
    includeInstaller: true,
  };
  try {
    await executeOperation({
      operation: 'update',
      plugins: [],
      progress: () => undefined,
      runtimes: [runtime],
    });
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'internal update failed'}\n`);
    return 1;
  }
}
