import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

class FrontmatterError extends Error {
  name = 'FrontmatterError';
}

export async function sanitizeSkills(root: string, fields: string[]): Promise<void> {
  if (fields.length === 0) return;
  const info = await stat(root);
  if (!info.isDirectory()) return;
  await visit(root, new Set(fields));
}

async function visit(directory: string, fields: Set<string>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path, fields);
      continue;
    }
    if (entry.name !== 'SKILL.md') continue;
    const source = await readFile(path, 'utf8');
    await writeFile(path, removeFrontmatterFields(source, fields));
  }
}

function removeFrontmatterFields(source: string, fields: Set<string>): string {
  const lines = source.match(/.*(?:\r\n|\n|$)/g)?.filter((line) => line.length > 0) ?? [];
  if (lines.length < 2 || lines[0]?.trim() !== '---') throw new FrontmatterError('missing YAML frontmatter');
  let closed = false;
  const output: string[] = [lines[0]];
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!closed && trimmed === '---') {
      closed = true;
      output.push(line);
      continue;
    }
    if (!closed && isRemovedField(line, fields)) continue;
    output.push(line);
  }
  if (!closed) throw new FrontmatterError('unterminated YAML frontmatter');
  return output.join('');
}

function isRemovedField(line: string, fields: Set<string>): boolean {
  if (line.startsWith(' ') || line.startsWith('\t')) return false;
  const separator = line.indexOf(':');
  return separator >= 0 && fields.has(line.slice(0, separator));
}
