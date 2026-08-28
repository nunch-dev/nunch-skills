import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ClaudeBackend } from '../../plugins/nunch-skills/runtime/src/claude.ts';
import type { CodexBackend } from '../../plugins/nunch-skills/runtime/src/codex.ts';
import type { DoctorItem } from '../../plugins/nunch-skills/runtime/src/doctor.ts';
import { runDoctor, runLifecycleDoctor } from '../../plugins/nunch-skills/runtime/src/doctor.ts';
import {
  type LifecyclePreState,
  LifecycleService,
  type ProgressEvent,
} from '../../plugins/nunch-skills/runtime/src/lifecycle.ts';
import {
  recoverLifecycleTransaction,
  runLifecycleTransaction,
} from '../../plugins/nunch-skills/runtime/src/lifecycle-transaction.ts';
import type { LifecycleState } from '../../plugins/nunch-skills/runtime/src/state.ts';
import { acquireLock, LifecycleStore } from '../../plugins/nunch-skills/runtime/src/store.ts';
import { compareInstalledVersion } from '../../plugins/nunch-skills/runtime/src/update-policy.ts';
import { targetLabel } from './clack-ui.ts';
import { applyOwnershipResult, selectedUninstallPlugins, uninstallExecution } from './ownership.ts';
import type { CliOperation } from './public-cli.ts';
import { cliVersion } from './runtime-config.ts';

type CodexTargetRuntime = {
  target: 'codex';
  createBackend: (allowRepin: boolean) => CodexBackend;
  dataRoot: string;
  releaseCommit: string;
  includeInstaller: true;
};

type ClaudeTargetRuntime = {
  target: 'claude';
  createBackend: (allowRepin: boolean) => ClaudeBackend;
  dataRoot: string;
  releaseCommit: string;
  includeInstaller: true;
};

export type TargetRuntime = CodexTargetRuntime | ClaudeTargetRuntime;

type LifecycleOperation = Exclude<CliOperation, 'doctor'>;
type LifecycleOperationInput = Omit<OperationInput, 'operation'> & { operation: LifecycleOperation };

type OperationInput = {
  operation: CliOperation;
  plugins: string[];
  progress: (event: ProgressEvent, targetPrefix?: string) => void;
  runtimes: TargetRuntime[];
  doctorReport?: (report: DoctorItem[], duration: number) => Promise<void>;
};

export class DoctorErrorsFound extends Error {
  name = 'DoctorErrorsFound';
}

export class InstallConflictError extends Error {
  name = 'InstallConflictError';
}

export function resolveInstallOperation(
  state: LifecycleState,
  preState: LifecyclePreState,
  requestedVersion: string,
): LifecycleOperation {
  if (preState.plugins.length === 0) return 'install';
  const installedVersion = state.lastKnownGood?.version;
  if (installedVersion === undefined) {
    throw new InstallConflictError(
      'existing Nunch plugins have no trusted lifecycle state; run doctor before reinstalling',
    );
  }
  const order = compareInstalledVersion(installedVersion, requestedVersion);
  switch (order) {
    case 'older':
      return 'update';
    case 'same':
      return 'install';
    case 'newer':
      throw new InstallConflictError(`refusing release downgrade from ${installedVersion} to ${requestedVersion}`);
    default:
      return assertNever(order);
  }
}

export async function executeOperation(input: OperationInput): Promise<void> {
  switch (input.operation) {
    case 'doctor':
      await executeDoctorOperation(input);
      return;
    case 'install':
    case 'update':
    case 'uninstall':
      for (const runtime of input.runtimes) {
        await executeForTarget({ ...input, operation: input.operation }, runtime);
      }
      return;
    default:
      return assertNever(input.operation);
  }
}

async function executeDoctorOperation(input: OperationInput): Promise<void> {
  const startedAt = performance.now();
  const { progress } = input;
  const executableReport = runDoctor(
    undefined,
    (name, status) => progress({ operation: 'doctor', phase: 'verify', target: name, status }),
    input.runtimes.map((runtime) => runtime.target),
  );
  const installationReport = Promise.all(
    input.runtimes.map(async (runtime): Promise<DoctorItem> => {
      const target = `${targetLabel(runtime.target)} 설치 스킬`;
      progress({ operation: 'doctor', phase: 'verify', target, status: 'started' });
      try {
        const plugins = await queryInstalledPlugins(runtime);
        progress({ operation: 'doctor', phase: 'verify', target, status: 'completed' });
        return plugins.length === 0
          ? { name: `installed:${runtime.target}`, status: 'warning', detail: '설치된 스킬 없음' }
          : {
              name: `installed:${runtime.target}`,
              status: 'ok',
              detail: plugins.map((plugin) => `${plugin.name} (${plugin.version})`).join('\n'),
            };
      } catch (error) {
        progress({ operation: 'doctor', phase: 'verify', target, status: 'failed' });
        return {
          name: `installed:${runtime.target}`,
          status: 'error',
          detail: error instanceof Error ? `스킬 목록 조회 실패: ${error.name}` : '스킬 목록 조회 실패',
        };
      }
    }),
  );
  const codexRuntime = input.runtimes.find((runtime) => runtime.target === 'codex');
  const lifecycleReport =
    codexRuntime === undefined
      ? Promise.resolve([])
      : runLifecycleDoctor(
          {
            backend: codexRuntime.createBackend(false),
            store: new LifecycleStore(join(codexRuntime.dataRoot, 'lifecycle.json')),
          },
          (name, status, detail) =>
            progress({
              operation: 'doctor',
              phase: 'verify',
              target: detail === undefined ? name : `${name} · ${detail}`,
              status,
            }),
        );
  const [executables, installations, lifecycle] = await Promise.all([
    executableReport,
    installationReport,
    lifecycleReport,
  ]);
  const cliVersionItem: DoctorItem = { name: 'cli-version', status: 'ok', detail: cliVersion };
  const report = [...executables, cliVersionItem, ...installations, ...lifecycle];
  await input.doctorReport?.(report, performance.now() - startedAt);
  if (report.some((item) => item.status === 'error')) throw new DoctorErrorsFound('doctor found lifecycle errors');
}

async function queryInstalledPlugins(runtime: TargetRuntime): Promise<{ name: string; version: string }[]> {
  switch (runtime.target) {
    case 'claude':
      return runtime.createBackend(false).listInstalledWithVersions();
    case 'codex': {
      const records = await runtime.createBackend(false).listPluginRecords();
      return records.map((record) => ({ name: record.name, version: record.version }));
    }
    default:
      return assertNever(runtime);
  }
}

async function executeForTarget(input: LifecycleOperationInput, runtime: TargetRuntime): Promise<void> {
  const { operation, plugins, progress } = input;
  const { target, createBackend, dataRoot, releaseCommit, includeInstaller } = runtime;
  const prefix = targetLabel(target);
  let fullTeardown = false;
  const lock = await acquireLock(join(dataRoot, 'lifecycle.lock'), Date.now(), 600_000);
  try {
    const store = new LifecycleStore(join(dataRoot, 'lifecycle.json'));
    const inspectionBackend = createBackend(false);
    const state = await recoverLifecycleTransaction(store, inspectionBackend);
    const preState = await inspectionBackend.inspectPreState();
    const effectiveOperation =
      operation === 'install' ? resolveInstallOperation(state, preState, cliVersion) : operation;
    const backend = createBackend(effectiveOperation === 'update');
    const selectedPlugins = operation === 'uninstall' ? selectedUninstallPlugins(state, plugins) : plugins;
    const uninstall =
      operation === 'uninstall'
        ? uninstallExecution(state, selectedPlugins)
        : { plugins: selectedPlugins, removeTrust: false, removeMarketplace: false, fullTeardown: false };
    fullTeardown = uninstall.fullTeardown;
    const service = new LifecycleService(backend, (event) => progress(event, prefix), { includeInstaller });
    await runLifecycleTransaction(
      {
        store,
        backend,
        operation: effectiveOperation,
        release: { version: cliVersion, commit: releaseCommit },
        operationId: randomUUID(),
        startedAt: new Date().toISOString(),
      },
      async (current) => {
        switch (effectiveOperation) {
          case 'install':
            await service.install(selectedPlugins);
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
            assertNever(effectiveOperation);
        }
        return applyOwnershipResult({
          state: current,
          operation: operation === 'install' ? 'install' : effectiveOperation,
          plugins: operation === 'uninstall' ? uninstall.plugins : selectedPlugins,
          preState,
          includeInstaller,
        });
      },
    );
  } finally {
    await lock.release();
  }
  if (fullTeardown) await rm(dataRoot, { recursive: true, force: true });
}

function assertNever(value: never): never {
  throw new TypeError(`unexpected operation: ${String(value)}`);
}
