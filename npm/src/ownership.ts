import { join } from 'node:path';
import { installerName } from '../../plugins/nch-installer/runtime/src/installer-identity.ts';
import type { LifecyclePreState } from '../../plugins/nch-installer/runtime/src/lifecycle.ts';
import { addResource, type LifecycleState, removeResource } from '../../plugins/nch-installer/runtime/src/state.ts';
import { LifecycleStore } from '../../plugins/nch-installer/runtime/src/store.ts';
import type { CliOperation } from './public-cli.ts';

type OwnershipInput = {
  state: LifecycleState;
  operation: Exclude<CliOperation, 'doctor'>;
  plugins: string[];
  preState: LifecyclePreState;
  includeInstaller?: boolean;
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

export function selectedUninstallPlugins(state: LifecycleState, selected: string[]): string[] {
  const installed = new Set(
    state.resources
      .filter((resource) => resource.kind === 'plugin')
      .map((resource) => resource.name.replace(/@nunch-skills$/, '')),
  );
  return selected.filter((name) => installed.has(name));
}

export function uninstallExecution(state: LifecycleState, selected: string[]): UninstallExecution {
  const fullTeardown = selected.includes(installerName);
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
  const includeInstaller = input.includeInstaller ?? true;
  const state = input.state;
  const { operation, plugins, preState } = input;
  if (operation === 'install') {
    const pluginNames = includeInstaller ? [installerName, ...plugins] : plugins;
    let next = state;
    for (const name of pluginNames) {
      const key = `${name}@nunch-skills`;
      const existing = state.resources.find((r) => r.kind === 'plugin' && r.name === key);
      const ownership = existing?.ownership ?? (preState.plugins.includes(name) ? 'pre-existing' : 'created');
      next = addResource(next, {
        kind: 'plugin',
        name: key,
        ownership,
        ...(ownership === 'created' ? {} : { preStateFingerprint: name }),
      });
    }
    const existingMarketplace = state.resources.find((r) => r.kind === 'marketplace' && r.name === 'nunch-skills');
    const marketplaceOwnership = existingMarketplace?.ownership ?? (preState.marketplace ? 'pre-existing' : 'created');
    next = addResource(next, {
      kind: 'marketplace',
      name: 'nunch-skills',
      ownership: marketplaceOwnership,
      ...(marketplaceOwnership === 'created' ? {} : { preStateFingerprint: 'present' }),
    });
    if (!includeInstaller) return next;
    const existingTrust = state.resources.find((r) => r.kind === 'trust' && r.name === 'installer-session-start');
    const trustOwnership = existingTrust?.ownership ?? (preState.trust ? 'pre-existing' : 'created');
    return addResource(next, {
      kind: 'trust',
      name: 'installer-session-start',
      ownership: trustOwnership,
      ...(trustOwnership === 'created' ? {} : { preStateFingerprint: 'present' }),
    });
  }
  if (operation === 'uninstall') {
    if (plugins.includes(installerName)) {
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
