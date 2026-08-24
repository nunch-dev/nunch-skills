import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

import { z } from 'zod';

const namePattern = /^[A-Za-z0-9._-]+$/;
const frontmatterFieldPattern = /^[A-Za-z][A-Za-z0-9-]*$/;

const copySchema = z.strictObject({
  source: z.string(),
  destination: z.string(),
  removeFrontmatter: z.array(z.string().regex(frontmatterFieldPattern)).optional(),
});

const versionSchema = z.strictObject({
  source: z.string(),
  targets: z.array(z.string()).min(1),
  appendCommit: z.boolean(),
});

const upstreamSchema = z.strictObject({
  name: z.string().regex(namePattern),
  repository: z.string().trim().min(1),
  ref: z.string().trim().min(1),
  copies: z.array(copySchema).min(1),
  version: versionSchema.optional(),
});

const configSchema = z.strictObject({ upstreams: z.array(upstreamSchema).min(1) });

export type UpstreamSpec = z.infer<typeof upstreamSchema>;
type UpstreamConfig = z.infer<typeof configSchema>;

class ConfigError extends Error {
  name = 'ConfigError';
}

export function parseConfig(raw: unknown): UpstreamConfig {
  const config = configSchema.parse(raw);
  const names = new Set<string>();
  const destinations: string[] = [];
  const versionTargets: string[] = [];

  for (const upstream of config.upstreams) {
    if (names.has(upstream.name)) throw new ConfigError(`duplicate upstream name ${upstream.name}`);
    names.add(upstream.name);
    for (const copy of upstream.copies) {
      copy.source = parseRelativePath('source', copy.source);
      copy.destination = parseRelativePath('destination', copy.destination);
      ensureNoOverlap(copy.destination, destinations, 'destination');
      ensureNoOverlap(copy.destination, versionTargets, 'copy/version target');
      destinations.push(copy.destination);
    }
    if (upstream.version !== undefined) {
      upstream.version.source = parseRelativePath('version source', upstream.version.source);
      for (let index = 0; index < upstream.version.targets.length; index += 1) {
        const target = upstream.version.targets[index];
        if (target === undefined) throw new ConfigError('version target is missing');
        const parsed = parseRelativePath('version target', target);
        ensureNoOverlap(parsed, destinations, 'copy/version target');
        ensureNoOverlap(parsed, versionTargets, 'version target');
        upstream.version.targets[index] = parsed;
        versionTargets.push(parsed);
      }
    }
  }
  return config;
}

function parseRelativePath(field: string, value: string): string {
  const normalized = normalize(value);
  if (
    value.length === 0 ||
    normalized === '.' ||
    isAbsolute(value) ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new ConfigError(`${field} must stay inside its root: ${value}`);
  }
  return normalized;
}

export function resolveInside(root: string, path: string): string {
  const target = resolve(root, path);
  const offset = relative(root, target);
  if (offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw new ConfigError(`path escapes root: ${path}`);
  }
  return target;
}

function ensureNoOverlap(candidate: string, paths: string[], label: string): void {
  for (const existing of paths) {
    if (
      candidate === existing ||
      candidate.startsWith(`${existing}${sep}`) ||
      existing.startsWith(`${candidate}${sep}`)
    ) {
      throw new ConfigError(`overlapping ${label}: ${candidate}`);
    }
  }
}
