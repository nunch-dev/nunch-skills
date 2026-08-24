import { readFile, rm } from 'node:fs/promises';

import type { z } from 'zod';

import {
  type BackendOptions,
  commitPattern,
  marketplaceSchema,
  pluginListSchema,
  type pluginSchema,
  snapshotSchema,
} from './codex-schema.ts';
import { CommandError } from './command.ts';
import { writeAtomic } from './store.ts';
import { inspectTrustHash, TrustEditor } from './trust.ts';

type Operation = 'install' | 'update' | 'uninstall';

export class CodexSnapshotManager {
  options: BackendOptions;
  trustId: string;

  constructor(options: BackendOptions, trustId: string) {
    this.options = options;
    this.trustId = trustId;
  }

  async snapshot(operation: Operation): Promise<void> {
    const path = this.options.snapshotPath;
    if (path === undefined) return;
    const marketplace = await this.marketplaceRoot();
    const commit =
      marketplace === undefined
        ? undefined
        : (await this.options.runner.run('git', ['-C', marketplace, 'rev-parse', 'HEAD'])).trim();
    if (commit !== undefined && !commitPattern.test(commit)) throw new CommandError('marketplace commit is invalid');
    const plugins = marketplace === undefined ? [] : await this.pluginList();
    const trustHash =
      this.options.configPath === undefined ? undefined : await inspectTrustHash(this.options.configPath, this.trustId);
    const snapshot = {
      operation,
      ...(commit === undefined ? {} : { marketplaceCommit: commit }),
      plugins: plugins.filter((plugin) => plugin.installed && plugin.marketplaceName === this.options.marketplace),
      ...(trustHash === undefined ? {} : { trustHash }),
    };
    await writeAtomic(path, `${JSON.stringify(snapshotSchema.parse(snapshot), null, 2)}\n`);
  }

  async rollback(operation: Operation): Promise<void> {
    const path = this.options.snapshotPath;
    if (path === undefined) return;
    const snapshot = snapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (snapshot.operation !== operation) throw new CommandError('snapshot operation mismatch');
    if (snapshot.marketplaceCommit === undefined) {
      if ((await this.marketplaceRoot()) !== undefined) {
        for (const plugin of await this.pluginList()) {
          if (plugin.installed && plugin.marketplaceName === this.options.marketplace) {
            await this.options.runner.run(this.options.codexCommand, ['plugin', 'remove', plugin.pluginId, '--json']);
          }
        }
        await this.restoreTrust(snapshot.trustHash);
        await this.removeMarketplace();
      }
      return;
    }
    await this.repinMarketplace(snapshot.marketplaceCommit);
    const expected = new Set(snapshot.plugins.map((plugin) => plugin.pluginId));
    for (const plugin of await this.pluginList()) {
      if (plugin.installed && plugin.marketplaceName === this.options.marketplace && !expected.has(plugin.pluginId)) {
        await this.options.runner.run(this.options.codexCommand, ['plugin', 'remove', plugin.pluginId, '--json']);
      }
    }
    const ordered = [...snapshot.plugins].sort((left, right) => {
      if (left.name === 'nunch-skills-manager') return 1;
      if (right.name === 'nunch-skills-manager') return -1;
      return left.pluginId.localeCompare(right.pluginId);
    });
    for (const plugin of ordered) {
      await this.options.runner.run(this.options.codexCommand, ['plugin', 'add', plugin.pluginId, '--json']);
    }
    await this.restoreTrust(snapshot.trustHash);
  }

  async commit(): Promise<void> {
    if (this.options.snapshotPath !== undefined) await rm(this.options.snapshotPath, { force: true });
  }

  private async pluginList(): Promise<z.infer<typeof pluginSchema>[]> {
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

  private async removeMarketplace(): Promise<void> {
    await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'marketplace',
      'remove',
      this.options.marketplace,
      '--json',
    ]);
  }

  private async repinMarketplace(commit: string): Promise<void> {
    if ((await this.marketplaceRoot()) !== undefined) await this.removeMarketplace();
    await this.options.runner.run(this.options.codexCommand, [
      'plugin',
      'marketplace',
      'add',
      'nunch-dev/nunch-skills',
      '--ref',
      commit,
      '--json',
    ]);
  }

  private async restoreTrust(hash: string | undefined): Promise<void> {
    const configPath = this.options.configPath;
    if (configPath === undefined) return;
    const current = await inspectTrustHash(configPath, this.trustId);
    const editor = new TrustEditor(configPath);
    if (hash === undefined) {
      if (current !== undefined) await editor.remove(this.trustId, current);
      return;
    }
    await editor.upsert(this.trustId, current ?? '', hash);
  }
}
