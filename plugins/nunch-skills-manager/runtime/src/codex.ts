import {
  type BackendOptions,
  commitPattern,
  installResultSchema,
  marketplaceSchema,
  pluginListSchema,
  type pluginSchema,
} from './codex-schema.ts';
import { CodexSnapshotManager } from './codex-snapshot.ts';
import { CommandError } from './command.ts';
import type { LifecycleBackend, LifecyclePreState } from './lifecycle.ts';
import { inspectTrustHash, TrustEditor, verifyInstalledManagerPayload } from './trust.ts';

const trustId = 'nunch-skills-manager@nunch-skills:hooks/hooks.json:session_start:0:0';

export class CodexBackend implements LifecycleBackend {
  options: BackendOptions;

  constructor(options: BackendOptions) {
    if (!commitPattern.test(options.releaseCommit)) throw new CommandError('release commit is invalid');
    this.options = options;
  }

  async listInstalled(): Promise<string[]> {
    const raw = await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'list',
      '--marketplace',
      this.options.marketplace,
      '--json',
      '--available',
    ]);
    return pluginListSchema
      .parse(JSON.parse(raw))
      .installed.filter((plugin) => plugin.installed && plugin.marketplaceName === this.options.marketplace)
      .map((plugin) => plugin.name);
  }

  async inspectPreState(): Promise<LifecyclePreState> {
    const marketplace = (await this.marketplaceRoot()) !== undefined;
    const plugins = marketplace ? await this.listInstalled() : [];
    const trust =
      this.options.configPath === undefined
        ? false
        : (await inspectTrustHash(this.options.configPath, trustId)) !== undefined;
    return { plugins, marketplace, trust };
  }

  async listPluginRecords(): Promise<import('zod').infer<typeof pluginSchema>[]> {
    return (await this.pluginList()).filter(
      (plugin) => plugin.installed && plugin.marketplaceName === this.options.marketplace,
    );
  }

  async verifyManagerIntegrity(): Promise<string> {
    const manifest = this.options.releaseManifest;
    if (manifest === undefined) throw new CommandError('verified release manifest is missing');
    const manager = (await this.listPluginRecords()).find((plugin) => plugin.name === 'nunch-skills-manager');
    if (manager === undefined) throw new CommandError('installed manager plugin is missing');
    return verifyInstalledManagerPayload(manager.source.path, manifest, process.platform);
  }

  async verifyTrust(): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) throw new CommandError('config path is missing');
    const expected = await this.verifyManagerIntegrity();
    if ((await inspectTrustHash(configPath, trustId)) !== expected) {
      throw new CommandError('manager hook trust differs');
    }
  }

  async verifyRelease(): Promise<void> {
    const root = await this.marketplaceRoot();
    if (root === undefined) return;
    const commit = (await this.options.runner.run('git', ['-C', root, 'rev-parse', 'HEAD'])).trim();
    if (commit !== this.options.releaseCommit) throw new CommandError('installed marketplace commit differs');
    const manifest = this.options.releaseManifest;
    if (manifest === undefined) throw new CommandError('verified release manifest is missing');
    const expected = new Map(manifest.plugins.map((plugin) => [plugin.name, plugin.version]));
    const installed = await this.listPluginRecords();
    for (const plugin of installed) {
      if (expected.get(plugin.name) !== plugin.version) {
        throw new CommandError(`installed plugin version differs: ${plugin.name}`);
      }
    }
    if (installed.some((plugin) => plugin.name === 'nunch-skills-manager')) {
      await this.verifyTrust();
    }
  }

  async ensureMarketplace(): Promise<void> {
    const marketplaces = marketplaceSchema.parse(
      JSON.parse(await this.options.runner.run(this.options.codexCommand, ['plugin', 'marketplace', 'list', '--json'])),
    ).marketplaces;
    const existing = marketplaces.find((marketplace) => marketplace.name === this.options.marketplace);
    if (existing !== undefined) {
      if (existing.root === undefined) throw new CommandError('marketplace root is missing');
      const commit = (await this.options.runner.run('git', ['-C', existing.root, 'rev-parse', 'HEAD'])).trim();
      if (commit === this.options.releaseCommit) return;
      if (this.options.allowRepin !== true) throw new CommandError('marketplace commit differs from release');
      await this.removeMarketplace();
    }
    await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'marketplace',
      'add',
      'nunch-dev/nunch-skills',
      '--ref',
      this.options.releaseCommit,
      '--json',
    ]);
  }

  async installPlugin(name: string): Promise<void> {
    await this.addPlugin(name);
  }

  async updatePlugin(name: string): Promise<void> {
    await this.addPlugin(name);
  }

  async removePlugin(name: string): Promise<void> {
    await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'remove',
      `${name}@${this.options.marketplace}`,
      '--json',
    ]);
  }

  async ensureTrust(): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) throw new CommandError('hook trust inputs are missing');
    const hash = await this.verifyManagerIntegrity();
    const current = await inspectTrustHash(configPath, trustId);
    if (current === hash) return;
    if (current !== undefined && this.options.allowRepin !== true) {
      throw new CommandError('existing manager hook trust differs');
    }
    await new TrustEditor(configPath).upsert(trustId, current ?? '', hash);
  }

  async removeTrust(): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) throw new CommandError('config path is missing');
    const current = await inspectTrustHash(configPath, trustId);
    if (current !== undefined) await new TrustEditor(configPath).remove(trustId, current);
  }

  async removeMarketplace(): Promise<void> {
    await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'marketplace',
      'remove',
      this.options.marketplace,
      '--json',
    ]);
  }

  async snapshot(operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    await new CodexSnapshotManager(this.options, trustId).snapshot(operation);
  }

  async rollback(operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    await new CodexSnapshotManager(this.options, trustId).rollback(operation);
  }

  async commit(_operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    await new CodexSnapshotManager(this.options, trustId).commit();
  }

  private async addPlugin(name: string): Promise<void> {
    const id = `${name}@${this.options.marketplace}`;
    const result = installResultSchema.parse(
      JSON.parse(await this.options.runner.run(this.options.codexCommand, ['plugin', 'add', id, '--json'])),
    );
    if (result.pluginId !== id) throw new CommandError('installed plugin identity changed');
  }

  private async pluginList(): Promise<import('zod').infer<typeof pluginSchema>[]> {
    const raw = await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'list',
      '--marketplace',
      this.options.marketplace,
      '--json',
      '--available',
    ]);
    return pluginListSchema.parse(JSON.parse(raw)).installed;
  }

  private async marketplaceRoot(): Promise<string | undefined> {
    const raw = await this.options.runner.run(this.options.codexCommand, ['plugin', 'marketplace', 'list', '--json']);
    return marketplaceSchema.parse(JSON.parse(raw)).marketplaces.find((item) => item.name === this.options.marketplace)
      ?.root;
  }
}
