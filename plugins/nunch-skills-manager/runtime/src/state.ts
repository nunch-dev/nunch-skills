import { z } from 'zod';

const resourceKindSchema = z.enum(['marketplace', 'plugin', 'trust', 'data']);
const ownershipSchema = z.enum(['created', 'adopted', 'pre-existing']);
const operationKindSchema = z.enum(['install', 'update', 'uninstall']);
const phaseSchema = z.enum(['prepared', 'plugins', 'trust', 'verify', 'rollback']);

const resourceSchema = z.strictObject({
  kind: resourceKindSchema,
  name: z.string().min(1),
  ownership: ownershipSchema,
  preStateFingerprint: z.string().min(1).optional(),
});

const operationSchema = z.strictObject({
  id: z.string().min(1),
  kind: operationKindSchema,
  phase: phaseSchema,
  startedAt: z.iso.datetime(),
  createdResources: z.array(resourceSchema),
});

const releaseSchema = z.strictObject({
  version: z.string().min(1),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
});

export const lifecycleStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    resources: z.array(resourceSchema),
    operation: operationSchema.optional(),
    lastKnownGood: releaseSchema.optional(),
  })
  .superRefine((state, context) => {
    const resourceKeys = state.resources.map((resource) => `${resource.kind}\0${resource.name}`);
    if (new Set(resourceKeys).size !== resourceKeys.length) {
      context.addIssue({ code: 'custom', message: 'lifecycle resources are duplicated' });
    }
    const operation = state.operation;
    if (operation === undefined) return;
    if (operation.kind !== 'install' && operation.createdResources.length > 0) {
      context.addIssue({ code: 'custom', message: 'only install can record created resources' });
    }
    const createdKeys = operation.createdResources.map((resource) => `${resource.kind}\0${resource.name}`);
    if (new Set(createdKeys).size !== createdKeys.length) {
      context.addIssue({ code: 'custom', message: 'operation resources are duplicated' });
    }
    for (const resource of operation.createdResources) {
      const present = resourceKeys.includes(`${resource.kind}\0${resource.name}`);
      if (resource.ownership !== 'created' || (!present && operation.phase !== 'rollback')) {
        context.addIssue({ code: 'custom', message: 'operation resource is invalid or orphaned' });
      }
    }
  });

export type OwnedResource = z.infer<typeof resourceSchema>;
export type OperationKind = z.infer<typeof operationKindSchema>;
type OperationPhase = z.infer<typeof phaseSchema>;
export type LifecycleState = z.infer<typeof lifecycleStateSchema>;

type BeginInput = { id: string; kind: OperationKind; startedAt: string };

class StateTransitionError extends Error {
  name = 'StateTransitionError';
}

export function createLifecycleState(): LifecycleState {
  return { schemaVersion: 1, resources: [] };
}

export function beginOperation(state: LifecycleState, input: BeginInput): LifecycleState {
  if (state.operation !== undefined) throw new StateTransitionError('operation transition is not allowed');
  return lifecycleStateSchema.parse({
    ...state,
    operation: { ...input, phase: 'prepared', createdResources: [] },
  });
}

export function advanceOperation(state: LifecycleState, next: OperationPhase): LifecycleState {
  const operation = state.operation;
  if (operation === undefined || !canAdvance(operation.phase, next)) {
    throw new StateTransitionError('operation transition is not allowed');
  }
  return lifecycleStateSchema.parse({ ...state, operation: { ...operation, phase: next } });
}

export function completeOperation(state: LifecycleState, release: z.infer<typeof releaseSchema>): LifecycleState {
  if (state.operation?.phase !== 'verify') throw new StateTransitionError('operation transition is not allowed');
  return lifecycleStateSchema.parse({ schemaVersion: 1, resources: state.resources, lastKnownGood: release });
}

export function completeRollback(state: LifecycleState): LifecycleState {
  if (state.operation?.phase !== 'rollback') throw new StateTransitionError('operation transition is not allowed');
  return lifecycleStateSchema.parse({
    schemaVersion: 1,
    resources: state.resources,
    ...(state.lastKnownGood === undefined ? {} : { lastKnownGood: state.lastKnownGood }),
  });
}

export function addResource(state: LifecycleState, resource: OwnedResource): LifecycleState {
  validateResource(resource);
  const previous = state.resources.find((item) => item.kind === resource.kind && item.name === resource.name);
  if (previous !== undefined && previous.ownership !== 'created' && resource.ownership === 'created') {
    throw new StateTransitionError('ownership promotion is not allowed');
  }
  if (previous !== undefined && !canChangeOwnership(previous.ownership, resource.ownership)) {
    throw new StateTransitionError('ownership transition is not allowed');
  }
  const resources = state.resources.filter((item) => item.kind !== resource.kind || item.name !== resource.name);
  return lifecycleStateSchema.parse({ ...state, resources: [...resources, resource] });
}

export function removeResource(state: LifecycleState, kind: OwnedResource['kind'], name: string): LifecycleState {
  return lifecycleStateSchema.parse({
    ...state,
    resources: state.resources.filter((resource) => resource.kind !== kind || resource.name !== name),
  });
}

function validateResource(resource: OwnedResource): void {
  resourceSchema.parse(resource);
  if (resource.ownership !== 'created' && resource.preStateFingerprint === undefined) {
    throw new StateTransitionError('non-created resource requires a pre-state fingerprint');
  }
}

function canChangeOwnership(previous: OwnedResource['ownership'], next: OwnedResource['ownership']): boolean {
  if (previous === 'created') return next === 'created';
  if (previous === 'adopted') return next === 'adopted';
  return next === 'pre-existing' || next === 'adopted';
}

function canAdvance(previous: OperationPhase, next: OperationPhase): boolean {
  switch (previous) {
    case 'prepared':
      return next === 'plugins' || next === 'rollback';
    case 'plugins':
      return next === 'trust' || next === 'rollback';
    case 'trust':
      return next === 'verify' || next === 'rollback';
    case 'verify':
      return next === 'rollback';
    case 'rollback':
      return false;
  }
}
