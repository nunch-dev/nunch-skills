import type { LifecycleBackend } from './lifecycle.ts';
import {
  advanceOperation,
  beginOperation,
  completeOperation,
  completeRollback,
  type LifecycleState,
  type OperationKind,
} from './state.ts';
import type { LifecycleStore } from './store.ts';

type ReleaseIdentity = { version: string; commit: string };
type TransactionOptions = {
  store: LifecycleStore;
  backend: LifecycleBackend;
  operation: OperationKind;
  release: ReleaseIdentity;
  operationId: string;
  startedAt: string;
};

class LifecycleRollbackError extends Error {
  name = 'LifecycleRollbackError';
}

export async function recoverLifecycleTransaction(
  store: LifecycleStore,
  backend: LifecycleBackend,
): Promise<LifecycleState> {
  let state = await store.load();
  const operation = state.operation;
  if (operation === undefined) return state;
  if (operation.phase !== 'rollback') {
    state = advanceOperation(state, 'rollback');
    await store.save(state);
  }
  await backend.rollback(operation.kind);
  state = completeRollback(state);
  await store.save(state);
  await backend.commit(operation.kind);
  return state;
}

export async function runLifecycleTransaction(
  options: TransactionOptions,
  mutate: (state: LifecycleState) => Promise<LifecycleState>,
): Promise<LifecycleState> {
  let state = await recoverLifecycleTransaction(options.store, options.backend);
  await options.backend.snapshot(options.operation);
  state = beginOperation(state, {
    id: options.operationId,
    kind: options.operation,
    startedAt: options.startedAt,
  });
  await options.store.save(state);
  try {
    state = advanceOperation(state, 'plugins');
    await options.store.save(state);
    state = await mutate(state);
    state = advanceOperation(state, 'trust');
    await options.store.save(state);
    await options.backend.verifyRelease();
    state = advanceOperation(state, 'verify');
    await options.store.save(state);
    state = completeOperation(state, options.release);
    await options.store.save(state);
  } catch (error) {
    let rollbackState = await options.store.load();
    if (rollbackState.operation !== undefined && rollbackState.operation.phase !== 'rollback') {
      rollbackState = advanceOperation(rollbackState, 'rollback');
      await options.store.save(rollbackState);
    }
    try {
      await options.backend.rollback(options.operation);
      rollbackState = completeRollback(rollbackState);
      await options.store.save(rollbackState);
      await options.backend.commit(options.operation);
    } catch (rollbackError) {
      throw new LifecycleRollbackError('lifecycle rollback failed', { cause: rollbackError });
    }
    throw error;
  }
  await options.backend.commit(options.operation);
  return state;
}
