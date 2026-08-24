export type CliOperation = 'install' | 'update' | 'uninstall' | 'doctor' | 'settings' | 'cancel';

type PublicCliInput = { argv: string[]; stdinTty: boolean; stdoutTty: boolean };

export interface PublicCliDependencies {
  chooseOperation(): Promise<CliOperation>;
  choosePlugins(plugins: string[]): Promise<string[] | undefined>;
  availablePlugins(): Promise<string[]>;
  installedPlugins(): Promise<string[]>;
  execute(kind: Exclude<CliOperation, 'cancel' | 'settings'>, plugins: string[]): Promise<void>;
  writeError(message: string): void;
  configureTelemetry?(): Promise<void>;
  confirm?(message: string): Promise<boolean>;
}

export function publicInputRejection(input: PublicCliInput): string | undefined {
  if (input.argv.length > 0) return 'nunch-skills is interactive; run it without arguments';
  if (!input.stdinTty || !input.stdoutTty) return 'nunch-skills requires an interactive terminal';
  return undefined;
}

export async function runPublicCli(input: PublicCliInput, dependencies: PublicCliDependencies): Promise<number> {
  const rejection = publicInputRejection(input);
  if (rejection !== undefined) {
    dependencies.writeError(rejection);
    return 2;
  }
  const operation = await dependencies.chooseOperation();
  if (operation === 'cancel') return 0;
  if (operation === 'settings') {
    await dependencies.configureTelemetry?.();
    return 0;
  }
  if (operation === 'update' || operation === 'doctor') {
    await dependencies.execute(operation, []);
    return 0;
  }
  const choices =
    operation === 'install' ? await dependencies.availablePlugins() : await dependencies.installedPlugins();
  const selected = await dependencies.choosePlugins(choices);
  if (selected === undefined || (operation === 'uninstall' && selected.length === 0)) return 0;
  if (operation === 'uninstall' && dependencies.confirm !== undefined) {
    if (!(await dependencies.confirm('선택한 스킬을 삭제할까요?'))) return 0;
  }
  await dependencies.execute(operation, selected);
  return 0;
}
