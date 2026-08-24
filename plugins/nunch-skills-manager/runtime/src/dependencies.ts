import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import type { pluginSchema } from './codex-schema.ts';

const execFileAsync = promisify(execFile);
const executableSchema = z.strictObject({
  name: z.string().min(1),
  requirement: z.string().min(1),
  candidates: z.array(z.string().min(1)).min(1),
  versionArgs: z.array(z.string()).min(1),
  versionPrefix: z.string(),
  minimumVersion: z.string(),
});
const dependencySchema = z.strictObject({
  schemaVersion: z.literal(1),
  executables: z.array(executableSchema).default([]),
  manual: z.array(z.strictObject({ name: z.string().min(1) })).default([]),
});

type PluginRecord = z.infer<typeof pluginSchema>;
type Executable = z.infer<typeof executableSchema>;
type DependencyIssue = { requirement: string; requiredBy: string[] };
type DependencyReport = { missing: DependencyIssue[]; manual: DependencyIssue[] };

export async function inspectDependencies(plugins: PluginRecord[]): Promise<DependencyReport> {
  const executableOwners = new Map<string, { declaration: Executable; requiredBy: string[] }>();
  const manualOwners = new Map<string, string[]>();
  for (const plugin of plugins) {
    const manifest = await readManifest(plugin);
    for (const declaration of manifest.executables) {
      const existing = executableOwners.get(declaration.name);
      if (existing !== undefined && JSON.stringify(existing.declaration) !== JSON.stringify(declaration)) {
        throw new DependencyError(`conflicting dependency declaration: ${declaration.name}`);
      }
      executableOwners.set(declaration.name, {
        declaration,
        requiredBy: [...(existing?.requiredBy ?? []), plugin.name].sort(),
      });
    }
    for (const declaration of manifest.manual) {
      manualOwners.set(declaration.name, [...(manualOwners.get(declaration.name) ?? []), plugin.name].sort());
    }
  }
  const missing: DependencyIssue[] = [];
  for (const [name, item] of [...executableOwners.entries()].sort()) {
    if (!(await available(item.declaration))) {
      missing.push({ requirement: item.declaration.requirement || name, requiredBy: item.requiredBy });
    }
  }
  const manual = [...manualOwners.entries()].sort().map(([requirement, requiredBy]) => ({ requirement, requiredBy }));
  return { missing, manual };
}

class DependencyError extends Error {
  name = 'DependencyError';
}

async function readManifest(plugin: PluginRecord): Promise<z.infer<typeof dependencySchema>> {
  try {
    return dependencySchema.parse(JSON.parse(await readFile(join(plugin.source.path, 'dependencies.json'), 'utf8')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { schemaVersion: 1, executables: [], manual: [] };
    }
    throw error;
  }
}

async function available(declaration: Executable): Promise<boolean> {
  for (const candidate of declaration.candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      throw new DependencyError(`dependency candidate is not an executable name: ${candidate}`);
    }
    try {
      const result = await execFileAsync(candidate, declaration.versionArgs, {
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (versionMeetsMinimum(result.stdout, declaration)) return true;
    } catch (error) {
      if (error instanceof Error) continue;
      throw error;
    }
  }
  return false;
}

function versionMeetsMinimum(output: string, declaration: Executable): boolean {
  const raw = output.trim();
  if (declaration.versionPrefix.length > 0 && !raw.startsWith(declaration.versionPrefix)) return false;
  const value = raw.slice(declaration.versionPrefix.length).trim().split(/\s+/)[0];
  if (value === undefined) return false;
  const current = versionParts(value);
  const minimum = versionParts(declaration.minimumVersion);
  if (current === undefined || minimum === undefined) return false;
  for (let index = 0; index < 3; index += 1) {
    const left = current[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

function versionParts(value: string): number[] | undefined {
  if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(value)) return undefined;
  return value.split('.').map(Number);
}
