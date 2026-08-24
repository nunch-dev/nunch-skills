import { pluginListSchema } from './codex-schema.ts';
import { ExecRunner } from './command.ts';
import { inspectDependencies } from './dependencies.ts';

export async function dependencyNotice(codexCommand: string): Promise<string | undefined> {
  const runner = new ExecRunner();
  const raw = await runner.run(codexCommand, [
    'plugin',
    'list',
    '--marketplace',
    'nunch-skills',
    '--json',
    '--available',
  ]);
  const plugins = pluginListSchema
    .parse(JSON.parse(raw))
    .installed.filter((plugin) => plugin.installed && plugin.marketplaceName === 'nunch-skills');
  const report = await inspectDependencies(plugins);
  const issues = [
    ...report.missing.map((issue) => `${issue.requirement} (${issue.requiredBy.join(', ')})`),
    ...report.manual.map((issue) => `${issue.requirement} (${issue.requiredBy.join(', ')})`),
  ];
  return issues.length === 0 ? undefined : `Dependency setup required: ${issues.join('; ')}.`;
}
