import { z } from 'zod';

import type { ReleaseManifest } from './release-manifest.ts';

export const commitPattern = /^[0-9a-f]{40}$/;

export const marketplaceSchema = z.object({
  marketplaces: z.array(z.object({ name: z.string(), root: z.string().optional() })),
});

export const pluginSchema = z.object({
  pluginId: z.string().min(1),
  name: z.string().min(1),
  marketplaceName: z.string().min(1),
  version: z.string().min(1),
  installed: z.boolean(),
  source: z.object({ path: z.string() }),
});

export const pluginListSchema = z.object({ installed: z.array(pluginSchema) });
export const installResultSchema = z.object({ pluginId: z.string(), name: z.string(), version: z.string() });
export const snapshotSchema = z.strictObject({
  operation: z.enum(['install', 'update', 'uninstall']),
  marketplaceCommit: z.string().regex(commitPattern).optional(),
  plugins: z.array(pluginSchema),
  trustHash: z.string().optional(),
});

export interface CommandRunner {
  run(command: string, args: string[], signal?: AbortSignal): Promise<string>;
}

export type BackendOptions = {
  runner: CommandRunner;
  codexCommand: string;
  marketplace: string;
  releaseCommit: string;
  allowRepin?: boolean;
  configPath?: string;
  releaseManifest?: ReleaseManifest;
  snapshotPath?: string;
};
