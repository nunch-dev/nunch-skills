import { join } from 'node:path';
import type { LifecyclePreState } from '../../plugins/nunch-skills-manager/runtime/src/lifecycle.ts';
import {
  addResource,
  type LifecycleState,
  removeResource,
} from '../../plugins/nunch-skills-manager/runtime/src/state.ts';
import { LifecycleStore } from '../../plugins/nunch-skills-manager/runtime/src/store.ts';
import type { CliOperation } from './public-cli.ts';

type OwnershipInput = {
  state: LifecycleState;
  operation: Exclude<CliOperation, 'cancel' | 'settings' | 'doctor'>;
  plugins: string[];
  preState: LifecyclePreState;
};

type UninstallExecution = {
  plugins: string[];
  removeTrust: boolean;
  removeMarketplace: boolean;
  fullTeardown: boolean;
};

export async function uninstallChoices(dataRoot: string): Promise<string[]> {
  const state = await new LifecycleStore(join(dataRoot, 'lifecycle.json')).load();
  return state.resources
    .filter((resource) => resource.kind === 'plugin' && resource.ownership === 'created')
    .map((resource) => resource.name.replace(/@nunch-skills$/, ''))
    .sort();
}

export function uninstallExecution(state: LifecycleState, selected: string[]): UninstallExecution {
  const fullTeardown = selected.includes('nunch-skills-manager');
  if (!fullTeardown) {
    return { plugins: selected, removeTrust: false, removeMarketplace: false, fullTeardown: false };
  }
  const plugins = state.resources
    .filter((resource) => resource.kind === 'plugin' && resource.ownership === 'created')
    .map((resource) => resource.name.replace(/@nunch-skills$/, ''));
  const preservesPlugins = state.resources.some(
    (resource) => resource.kind === 'plugin' && resource.ownership !== 'created',
  );
  return {
    plugins,
    removeTrust: hasCreated(state, 'trust'),
    removeMarketplace: hasCreated(state, 'marketplace') && !preservesPlugins,
    fullTeardown: true,
  };
}

export function applyOwnershipResult(input: OwnershipInput): LifecycleState {
  const { state, operation, plugins, preState } = input;
  if (operation === 'install') {
    let next = state;
    for (const name of ['nunch-skills-manager', ...plugins]) {
      const ownership = preState.plugins.includes(name) ? 'pre-existing' : 'created';
      next = addResource(next, {
        kind: 'plugin',
        name: `${name}@nunch-skills`,
        ownership,
        ...(ownership === 'created' ? {} : { preStateFingerprint: name }),
      });
    }
    const marketplaceOwnership = preState.marketplace ? 'pre-existing' : 'created';
    next = addResource(next, {
      kind: 'marketplace',
      name: 'nunch-skills',
      ownership: marketplaceOwnership,
      ...(marketplaceOwnership === 'created' ? {} : { preStateFingerprint: 'present' }),
    });
    const trustOwnership = preState.trust ? 'pre-existing' : 'created';
    return addResource(next, {
      kind: 'trust',
      name: 'manager-session-start',
      ownership: trustOwnership,
      ...(trustOwnership === 'created' ? {} : { preStateFingerprint: 'present' }),
    });
  }
  if (operation === 'uninstall') {
    if (plugins.includes('nunch-skills-manager')) {
      return { ...state, resources: state.resources.filter((resource) => resource.ownership !== 'created') };
    }
    let next = state;
    for (const name of plugins) next = removeResource(next, 'plugin', `${name}@nunch-skills`);
    return next;
  }
  return state;
}

function hasCreated(state: LifecycleState, kind: 'marketplace' | 'trust'): boolean {
  return state.resources.some((resource) => resource.kind === kind && resource.ownership === 'created');
}
