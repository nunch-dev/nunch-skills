import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CodexBackend } from '../../plugins/nunch-skills-manager/runtime/src/codex.ts';
import { ExecRunner } from '../../plugins/nunch-skills-manager/runtime/src/command.ts';
import { runLifecycleDoctor } from '../../plugins/nunch-skills-manager/runtime/src/doctor.ts';
import { LifecycleService, type ProgressEvent } from '../../plugins/nunch-skills-manager/runtime/src/lifecycle.ts';
import {
  recoverLifecycleTransaction,
  runLifecycleTransaction,
} from '../../plugins/nunch-skills-manager/runtime/src/lifecycle-transaction.ts';
import { acquireLock, LifecycleStore } from '../../plugins/nunch-skills-manager/runtime/src/store.ts';
import {
  loadTelemetryState,
  setTelemetryEnabled,
} from '../../plugins/nunch-skills-manager/runtime/src/telemetry-state.ts';
import { catalogPlugins } from './catalog.ts';
import { bindUiDependencies, ClackUi } from './clack-ui.ts';
import { applyOwnershipResult, uninstallChoices, uninstallExecution } from './ownership.ts';
import { type CliOperation, publicInputRejection, runPublicCli } from './public-cli.ts';
import { cliVersion, codexHomePath, resolveRelease } from './runtime-config.ts';
import { captureTelemetry } from './telemetry-runtime.ts';

class DoctorErrorsFound extends Error {
  name = 'DoctorErrorsFound';
}

type OperationRuntime = {
  createBackend: (allowRepin: boolean) => CodexBackend;
  dataRoot: string;
  releaseCommit: string;
};
type OperationInput = {
  operation: Exclude<CliOperation, 'cancel' | 'settings'>;
  plugins: string[];
  progress: (event: ProgressEvent) => void;
  runtime: OperationRuntime;
};

export async function main(): Promise<number> {
  if (process.env['NUNCH_SKILLS_INTERNAL_OPERATION'] === 'update') return runInternalUpdate();
  const input = {
    argv: process.argv.slice(2),
    stdinTty: process.stdin.isTTY,
    stdoutTty: process.stdout.isTTY,
  };
  const rejection = publicInputRejection(input);
  if (rejection !== undefined) {
    process.stderr.write(`${rejection}\n`);
    return 2;
  }
  const ui = new ClackUi();
  ui.intro();
  const codexHome = codexHomePath();
  const dataRoot = join(codexHome, 'plugins', 'data', 'nunch-skills');
  const telemetryPath = join(dataRoot, 'telemetry.json');

  const dependencies = bindUiDependencies(ui, {
    availablePlugins: async () =>
      catalogPlugins()
        .map((plugin) => plugin.name)
        .filter((name) => name !== 'nunch-skills-manager'),
    installedPlugins: async () => uninstallChoices(dataRoot),
    execute: async (operation, plugins) => {
      ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'started' });
      const release = await resolveRelease().catch((error: unknown) => {
        ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'failed' });
        throw error;
      });
      ui.progress({ operation, phase: 'verify', target: 'npm·Git 릴리스', status: 'completed' });
      const createBackend = (allowRepin: boolean): CodexBackend =>
        new CodexBackend({
          runner: new ExecRunner(),
          codexCommand: process.env['NUNCH_SKILLS_CODEX_COMMAND'] ?? 'codex',
          marketplace: 'nunch-skills',
          releaseCommit: release.commit,
          allowRepin,
          configPath: join(codexHome, 'config.toml'),
          ...(release.manifest === undefined ? {} : { releaseManifest: release.manifest }),
          snapshotPath: join(dataRoot, 'snapshots', 'foreground.json'),
        });
      await executeOperation({
        operation,
        plugins,
        progress: ui.progress.bind(ui),
        runtime: { createBackend, dataRoot, releaseCommit: release.commit },
      });
    },
    configureTelemetry: async () => {
      const current = await loadTelemetryState(telemetryPath, false);
      const enabled = await ui.confirm(current.enabled ? 'telemetry를 비활성화할까요?' : 'telemetry를 활성화할까요?');
      if (enabled) await setTelemetryEnabled(telemetryPath, !current.enabled);
    },
  });
  try {
    const code = await runPublicCli(input, dependencies);
    if (code === 0) ui.success('작업을 마쳤습니다');
    return code;
  } catch (error) {
    ui.error(error instanceof Error ? error.message : '알 수 없는 오류');
    return 1;
  }
}

async function runInternalUpdate(): Promise<number> {
  const codexHome = codexHomePath();
  const dataRoot = join(codexHome, 'plugins', 'data', 'nunch-skills');
  const release = await resolveRelease();
  const commit = release.commit;
  const backend = () =>
    new CodexBackend({
      runner: new ExecRunner(),
      codexCommand: process.env['NUNCH_SKILLS_CODEX_COMMAND'] ?? 'codex',
      marketplace: 'nunch-skills',
      releaseCommit: commit,
      allowRepin: true,
      configPath: join(codexHome, 'config.toml'),
      ...(release.manifest === undefined ? {} : { releaseManifest: release.manifest }),
      snapshotPath: join(dataRoot, 'snapshots', 'automatic.json'),
    });
  try {
    await executeOperation({
      operation: 'update',
      plugins: [],
      progress: () => undefined,
      runtime: { createBackend: backend, dataRoot, releaseCommit: commit },
    });
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'internal update failed'}\n`);
    return 1;
  }
}

async function executeOperation(input: OperationInput): Promise<void> {
  const { operation, plugins, progress } = input;
  const { createBackend, dataRoot, releaseCommit } = input.runtime;
  const startedAt = Date.now();
  let result: 'success' | 'failure' = 'success';
  let fullTeardown = false;
  try {
    if (operation === 'doctor') {
      const backend = createBackend(false);
      const store = new LifecycleStore(join(dataRoot, 'lifecycle.json'));
      const report = await runLifecycleDoctor({ backend, store }, (name, status, detail) => {
        progress({
          operation: 'doctor',
          phase: 'verify',
          target: detail === undefined ? name : `${name} · ${detail}`,
          status,
        });
      });
      if (report.some((item) => item.status === 'error')) throw new DoctorErrorsFound('doctor found lifecycle errors');
      return;
    }
    const lock = await acquireLock(join(dataRoot, 'lifecycle.lock'), Date.now(), 600_000);
    const store = new LifecycleStore(join(dataRoot, 'lifecycle.json'));
    try {
      const backend = createBackend(operation === 'update');
      const state = await recoverLifecycleTransaction(store, backend);
      const preState = await backend.inspectPreState();
      const uninstall =
        operation === 'uninstall'
          ? uninstallExecution(state, plugins)
          : { plugins, removeTrust: false, removeMarketplace: false, fullTeardown: false };
      fullTeardown = uninstall.fullTeardown;
      const service = new LifecycleService(backend, progress);
      await runLifecycleTransaction(
        {
          store,
          backend,
          operation,
          release: { version: cliVersion, commit: releaseCommit },
          operationId: randomUUID(),
          startedAt: new Date().toISOString(),
        },
        async (current) => {
          switch (operation) {
            case 'install':
              await service.install(plugins);
              break;
            case 'update':
              await service.update();
              break;
            case 'uninstall':
              await service.uninstall(uninstall.plugins, {
                removeTrust: uninstall.removeTrust,
                removeMarketplace: uninstall.removeMarketplace,
              });
              break;
            default:
              assertNever(operation);
          }
          return applyOwnershipResult({
            state: current,
            operation,
            plugins: operation === 'uninstall' ? uninstall.plugins : plugins,
            preState,
          });
        },
      );
    } finally {
      await lock.release();
    }
    if (fullTeardown) await rm(dataRoot, { recursive: true, force: true });
  } catch (error) {
    result = 'failure';
    throw error;
  } finally {
    if (!fullTeardown) await captureTelemetry(operation, plugins, result, Date.now() - startedAt, dataRoot);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unexpected operation: ${String(value)}`);
}
