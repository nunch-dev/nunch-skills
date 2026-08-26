import { readFile } from 'node:fs/promises';
import {
  type ClaudeBackendOptions,
  claudeMarketplaceSchema,
  claudePluginListSchema,
  claudeSnapshotSchema,
} from './claude-schema.ts';
import { CommandError } from './command.ts';
import type { LifecycleBackend, LifecyclePreState } from './lifecycle.ts';
import { writeAtomic } from './store.ts';

const expectedMarketplaceRepo = 'nunch-dev/nunch-skills';

export class ClaudeBackend implements LifecycleBackend {
  options: ClaudeBackendOptions;

  constructor(options: ClaudeBackendOptions) {
    this.options = options;
  }

  async listInstalled(): Promise<string[]> {
    return (await this.listInstalledWithVersions()).map((plugin) => plugin.name);
  }

  async listInstalledWithVersions(): Promise<{ name: string; version: string }[]> {
    const raw = await this.options.runner.run(this.options.claudeCommand, ['plugin', 'list', '--json']);
    const suffix = `@${this.options.marketplace}`;
    return claudePluginListSchema
      .parse(JSON.parse(raw))
      .filter((plugin) => plugin.id.endsWith(suffix))
      .map((plugin) => ({ name: plugin.id.slice(0, -suffix.length), version: plugin.version }));
  }

  async inspectPreState(): Promise<LifecyclePreState> {
    const marketplace = await this.hasMarketplace();
    const plugins = marketplace === undefined ? [] : await this.listInstalled();
    return { plugins, marketplace: marketplace !== undefined, trust: false };
  }

  async ensureMarketplace(): Promise<void> {
    const exists = await this.hasMarketplace();
    if (exists !== undefined) {
      this.assertMarketplaceSource(exists);
      if (this.options.allowRepin) {
        await this.options.runner.run(this.options.claudeCommand, [
          'plugin',
          'marketplace',
          'update',
          this.options.marketplace,
        ]);
      }
      return;
    }
    await this.options.runner.run(this.options.claudeCommand, [
      'plugin',
      'marketplace',
      'add',
      'nunch-dev/nunch-skills',
    ]);
  }

  async installPlugin(name: string): Promise<void> {
    await this.options.runner.run(this.options.claudeCommand, [
      'plugin',
      'install',
      `${name}@${this.options.marketplace}`,
    ]);
  }

  async updatePlugin(name: string): Promise<void> {
    await this.options.runner.run(this.options.claudeCommand, [
      'plugin',
      'update',
      `${name}@${this.options.marketplace}`,
    ]);
  }

  async removePlugin(name: string): Promise<void> {
    const installed = await this.listInstalled();
    if (!installed.includes(name)) return;
    await this.options.runner.run(this.options.claudeCommand, [
      'plugin',
      'uninstall',
      `${name}@${this.options.marketplace}`,
    ]);
  }

  async ensureTrust(): Promise<void> {}
  async removeTrust(): Promise<void> {}

  async removeMarketplace(): Promise<void> {
    await this.options.runner.run(this.options.claudeCommand, [
      'plugin',
      'marketplace',
      'remove',
      this.options.marketplace,
    ]);
  }

  async verifyRelease(): Promise<void> {
    const marketplace = await this.hasMarketplace();
    if (marketplace === undefined) throw new CommandError('marketplace is missing');
    this.assertMarketplaceSource(marketplace);
  }
  async snapshot(operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    const path = this.options.snapshotPath;
    if (path === undefined) return;
    const plugins = (await this.listInstalledWithVersions()).map((plugin) => ({
      id: `${plugin.name}@${this.options.marketplace}`,
      version: plugin.version,
    }));
    await writeAtomic(path, `${JSON.stringify(claudeSnapshotSchema.parse({ operation, plugins }), null, 2)}\n`);
  }

  async rollback(operation: 'install' | 'update' | 'uninstall'): Promise<void> {
    const path = this.options.snapshotPath;
    if (path === undefined) return;
    let stored: unknown;
    try {
      stored = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    const snapshot = claudeSnapshotSchema.parse(stored);
    if (snapshot.operation !== operation) throw new CommandError('snapshot operation mismatch');
    const current = await this.listInstalledWithVersions();
    for (const plugin of current) {
      const pluginId = `${plugin.name}@${this.options.marketplace}`;
      if (snapshot.plugins.some((kept) => kept.id === pluginId)) continue;
      await this.options.runner.run(this.options.claudeCommand, ['plugin', 'uninstall', pluginId]);
    }
  }

  async commit(_operation: 'install' | 'update' | 'uninstall'): Promise<void> {}

  private async hasMarketplace() {
    const raw = await this.options.runner.run(this.options.claudeCommand, ['plugin', 'marketplace', 'list', '--json']);
    return claudeMarketplaceSchema.parse(JSON.parse(raw)).find((item) => item.name === this.options.marketplace);
  }

  private assertMarketplaceSource(marketplace: { source: string; repo?: string | undefined }): void {
    if (marketplace.source !== 'github' || marketplace.repo !== expectedMarketplaceRepo) {
      throw new CommandError('marketplace source differs from nunch-dev/nunch-skills');
    }
  }
}
