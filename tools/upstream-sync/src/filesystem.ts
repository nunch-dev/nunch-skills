import { copyFile, lstat, mkdir, readdir, readlink, realpath, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

class FilesystemError extends Error {
  name = 'FilesystemError';
}

export async function copyEntry(source: string, destination: string): Promise<void> {
  const info = await lstat(source);
  await mkdir(dirname(destination), { recursive: true });
  if (info.isSymbolicLink()) {
    await symlink(await readlink(source), destination);
    return;
  }
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: info.mode });
    for (const entry of await readdir(source)) await copyEntry(join(source, entry), join(destination, entry));
    return;
  }
  if (!info.isFile()) throw new FilesystemError(`unsupported source file mode: ${source}`);
  await copyFile(source, destination);
  await import('node:fs/promises').then(({ chmod }) => chmod(destination, info.mode));
}

export async function ensureRealpathConfinement(root: string, target: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  let cursor = resolve(target);
  while (cursor !== dirname(cursor)) {
    try {
      const canonical = await realpath(cursor);
      const offset = relative(canonicalRoot, canonical);
      if (offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
        throw new FilesystemError(`path escapes real root: ${target}`);
      }
      return;
    } catch (error) {
      if (error instanceof FilesystemError) throw error;
      if (isMissing(error)) {
        cursor = dirname(cursor);
        continue;
      }
      throw error;
    }
  }
  throw new FilesystemError(`cannot establish confinement: ${target}`);
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
