const managerName = 'nunch-skills-manager';

export type ProgressEvent = {
  operation: 'install' | 'update' | 'uninstall' | 'doctor';
  phase: 'marketplace' | 'plugins' | 'trust' | 'verify' | 'rollback';
  target?: string;
  status: 'started' | 'completed' | 'skipped' | 'failed';
};

export type LifecyclePreState = { plugins: string[]; marketplace: boolean; trust: boolean };
type UninstallOptions = { removeTrust: boolean; removeMarketplace: boolean };

export interface LifecycleBackend {
  listInstalled(): Promise<string[]>;
  inspectPreState(): Promise<LifecyclePreState>;
  ensureMarketplace(): Promise<void>;
  installPlugin(name: string): Promise<void>;
  updatePlugin(name: string): Promise<void>;
  removePlugin(name: string): Promise<void>;
  ensureTrust(): Promise<void>;
  removeTrust(): Promise<void>;
  removeMarketplace(): Promise<void>;
  verifyRelease(): Promise<void>;
  snapshot(operation: 'install' | 'update' | 'uninstall'): Promise<void>;
  rollback(operation: 'install' | 'update' | 'uninstall'): Promise<void>;
  commit(operation: 'install' | 'update' | 'uninstall'): Promise<void>;
}

type ProgressSink = (event: ProgressEvent) => void;

export class LifecycleService {
  backend: LifecycleBackend;
  progress: ProgressSink;
  includeManager: boolean;

  constructor(
    backend: LifecycleBackend,
    progress: ProgressSink = () => undefined,
    options: { includeManager?: boolean } = {},
  ) {
    this.backend = backend;
    this.progress = progress;
    this.includeManager = options.includeManager ?? true;
  }

  async install(selected: string[]): Promise<void> {
    const leafPlugins = unique(selected.filter((name) => name !== managerName)).sort();
    const targets = this.includeManager ? [managerName, ...leafPlugins] : leafPlugins;
    const installedBefore = new Set(await this.backend.listInstalled());
    await this.stage('install', 'marketplace', undefined, () => this.backend.ensureMarketplace());
    for (const target of targets) {
      if (installedBefore.has(target)) {
        this.progress({ operation: 'install', phase: 'plugins', target, status: 'skipped' });
        continue;
      }
      await this.stage('install', 'plugins', target, () => this.backend.installPlugin(target));
    }
    if (this.includeManager) {
      await this.stage('install', 'trust', managerName, () => this.backend.ensureTrust());
    }
  }

  async update(): Promise<void> {
    const installed = await this.backend.listInstalled();
    const leaves = installed.filter((name) => name !== managerName).sort();
    await this.stage('update', 'marketplace', undefined, () => this.backend.ensureMarketplace());
    for (const target of leaves) {
      await this.stage('update', 'plugins', target, () => this.backend.updatePlugin(target));
    }
    if (installed.includes(managerName)) {
      await this.stage('update', 'trust', managerName, () => this.backend.removeTrust());
      await this.stage('update', 'plugins', managerName, () => this.backend.updatePlugin(managerName));
      await this.stage('update', 'trust', managerName, () => this.backend.ensureTrust());
    }
  }

  async uninstall(
    selected: string[],
    options: UninstallOptions = {
      removeTrust: selected.includes(managerName),
      removeMarketplace: selected.includes(managerName),
    },
  ): Promise<void> {
    const installed = await this.backend.listInstalled();
    if (selected.includes(managerName)) {
      const installedSet = new Set(installed);
      const leaves = unique(selected)
        .filter((name) => name !== managerName && installedSet.has(name))
        .sort();
      for (const target of [...leaves, managerName]) {
        await this.stage('uninstall', 'plugins', target, () => this.backend.removePlugin(target));
      }
      if (options.removeTrust) await this.stage('uninstall', 'trust', managerName, () => this.backend.removeTrust());
      if (options.removeMarketplace)
        await this.stage('uninstall', 'marketplace', undefined, () => this.backend.removeMarketplace());
      return;
    }
    const installedSet = new Set(installed);
    for (const target of unique(selected).sort()) {
      if (!installedSet.has(target)) {
        this.progress({ operation: 'uninstall', phase: 'plugins', target, status: 'skipped' });
        continue;
      }
      await this.stage('uninstall', 'plugins', target, () => this.backend.removePlugin(target));
    }
  }

  private async stage(
    operation: ProgressEvent['operation'],
    phase: ProgressEvent['phase'],
    target: string | undefined,
    run: () => Promise<void>,
  ): Promise<void> {
    const base = target === undefined ? { operation, phase } : { operation, phase, target };
    this.progress({ ...base, status: 'started' });
    try {
      await run();
      this.progress({ ...base, status: 'completed' });
    } catch (error) {
      this.progress({ ...base, status: 'failed' });
      throw error;
    }
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
