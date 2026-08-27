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
import { installerName, installerTrustId, legacyInstallerTrustId } from './installer-identity.ts';
import type { LifecycleBackend, LifecyclePreState } from './lifecycle.ts';
import { inspectTrustHash, TrustEditor, verifyInstallerPayload } from './trust.ts';

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
        : (await inspectTrustHash(this.options.configPath, installerTrustId)) !== undefined;
    return { plugins, marketplace, trust };
  }

  async listPluginRecords(): Promise<import('zod').infer<typeof pluginSchema>[]> {
    return (await this.pluginList()).filter(
      (plugin) => plugin.installed && plugin.marketplaceName === this.options.marketplace,
    );
  }

  async verifyInstallerIntegrity(): Promise<string> {
    const manifest = this.options.releaseManifest;
    if (manifest === undefined) throw new CommandError('verified release manifest is missing');
    const installer = (await this.listPluginRecords()).find((plugin) => plugin.name === installerName);
    if (installer === undefined) throw new CommandError('installed installer plugin is missing');
    return verifyInstallerPayload(installer.source.path, manifest, process.platform);
  }

  async verifyTrust(): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) throw new CommandError('config path is missing');
    const expected = await this.verifyInstallerIntegrity();
    if ((await inspectTrustHash(configPath, installerTrustId)) !== expected) {
      throw new CommandError('installer hook trust differs');
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
    if (installed.some((plugin) => plugin.name === installerName)) {
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
    if (this.options.releaseManifest === undefined)
      throw new CommandError(
        'verified release manifest is missing → 릴리스로 게시되지 않은 개발 체크아웃에서는 hook 신뢰를 등록할 수 없습니다. npm 릴리스 설치본(npx @nunch-dev/skills install)을 사용하세요.',
      );
    const hash = await this.verifyInstallerIntegrity();
    const current = await inspectTrustHash(configPath, installerTrustId);
    if (current === hash) return;
    if (current !== undefined && this.options.allowRepin !== true) {
      throw new CommandError('existing installer hook trust differs');
    }
    await new TrustEditor(configPath).upsert(installerTrustId, current ?? '', hash);
  }

  async removeTrust(): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) throw new CommandError('config path is missing');
    const editor = new TrustEditor(configPath);
    for (const trustId of [legacyInstallerTrustId, installerTrustId]) {
      const current = await inspectTrustHash(configPath, trustId);
      if (current !== undefined) await editor.remove(trustId, current);
    }
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
    await new CodexSnapshotManager(this.options, installerTrustId).snapshot(operation);
  }

  async rollback(operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    await new CodexSnapshotManager(this.options, installerTrustId).rollback(operation);
  }

  async commit(_operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    await new CodexSnapshotManager(this.options, installerTrustId).commit();
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
