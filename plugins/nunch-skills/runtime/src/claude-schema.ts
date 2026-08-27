import { z } from 'zod';

import type { CommandRunner } from './codex-schema.ts';

export const claudeMarketplaceSchema = z.array(
  z.object({
    name: z.string(),
    source: z.string(),
    repo: z.string().optional(),
  }),
);

const claudeInstalledPluginSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
});

export const claudePluginListSchema = z.array(claudeInstalledPluginSchema);

export const claudeSnapshotSchema = z.strictObject({
  operation: z.enum(['install', 'update', 'uninstall']),
  plugins: claudePluginListSchema,
});

export type ClaudeBackendOptions = {
  runner: CommandRunner;
  claudeCommand: string;
  marketplace: string;
  allowRepin?: boolean;
  snapshotPath?: string;
};
