import { Command, CommanderError, Option } from 'commander';
import packageManifest from '../../package.json' with { type: 'json' };

export type InstallTarget = 'codex' | 'claude';
export type InstallPlatform = InstallTarget | 'both';
export type DoctorMode = 'default' | 'status' | 'verbose';
export type CliOperation = 'install' | 'update' | 'uninstall' | 'doctor';

export type CliExecution = {
  operation: CliOperation;
  plugins: string[];
  targets: InstallTarget[];
  doctor?: { mode: DoctorMode; json: boolean };
};

type PublicCliInput = { argv: string[]; stdinTty: boolean; stdoutTty: boolean };

export interface PublicCliDependencies {
  choosePlatform(initial?: InstallPlatform): Promise<InstallPlatform | undefined>;
  choosePlugins(plugins: string[]): Promise<string[] | undefined>;
  availablePlugins(): Promise<string[]>;
  installedPlugins(targets: InstallTarget[]): Promise<string[]>;
  execute(execution: CliExecution): Promise<void>;
  writeError(message: string): void;
  writeOutput(message: string): void;
  configureTelemetry(): Promise<void>;
  confirm?(message: string): Promise<boolean>;
}

type InstallOptions = { tui: boolean; platform?: string; plugins?: string };
type PlatformOptions = { platform?: string };
type DoctorOptions = { status?: boolean; verbose?: boolean; json?: boolean; platform?: string };

export async function runPublicCli(input: PublicCliInput, dependencies: PublicCliDependencies): Promise<number> {
  const program = createProgram(input, dependencies);
  if (input.argv.length === 0) {
    dependencies.writeOutput(program.helpInformation());
    return 0;
  }

  try {
    await program.parseAsync(input.argv, { from: 'user' });
    return program.getOptionValue('exitCode') ?? 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
}

function createProgram(input: PublicCliInput, dependencies: PublicCliDependencies): Command {
  const program = new Command()
    .name('nunch-skills')
    .description('Codex와 Claude Code용 Nunch Skills 설치 및 진단 CLI')
    .version(packageManifest.version, '-v, --version', '버전 표시')
    .helpOption('-h, --help', '명령 도움말 표시')
    .configureOutput({
      writeOut: (message) => dependencies.writeOutput(message),
      writeErr: (message) => dependencies.writeError(message),
    })
    .exitOverride();

  program
    .command('install')
    .alias('setup')
    .description('대화형 설정으로 Nunch Skills 설치')
    .option('--no-tui', '비대화식 실행: --platform과 --plugins 필요')
    .addOption(platformOption('설치 대상'))
    .option('--plugins <plugins>', '쉼표로 구분한 스킬 이름, all 또는 none')
    .addHelpText(
      'after',
      '\n예시:\n  $ npx @nunch-dev/skills install\n  $ npx @nunch-dev/skills setup\n  $ npx @nunch-dev/skills install --no-tui --platform=both --plugins=all\n',
    )
    .action(async (options: InstallOptions) => {
      program.setOptionValue('exitCode', await install(input, dependencies, options));
    });

  program
    .command('update')
    .description('설치된 Nunch Skills 전체 업데이트')
    .addOption(platformOption('업데이트 대상'))
    .action(async (options: PlatformOptions) => {
      program.setOptionValue('exitCode', await update(input, dependencies, options));
    });

  program
    .command('uninstall')
    .description('선택한 Nunch Skills 삭제')
    .addOption(platformOption('삭제 대상'))
    .action(async (options: PlatformOptions) => {
      program.setOptionValue('exitCode', await uninstall(input, dependencies, options));
    });

  program
    .command('doctor')
    .description('Nunch Skills 설치 상태 점검 및 문제 진단')
    .option('--status', '간결한 시스템 대시보드 표시')
    .option('--verbose', '상세 진단 정보 표시')
    .option('--json', 'JSON 형식으로 출력')
    .addOption(new Option('--platform <platform>', '진단 대상: codex, claude').choices(['codex', 'claude']))
    .addHelpText(
      'after',
      '\n예시:\n  $ npx @nunch-dev/skills doctor\n  $ npx @nunch-dev/skills doctor --status\n  $ npx @nunch-dev/skills doctor --verbose --platform=codex\n  $ npx @nunch-dev/skills doctor --json\n',
    )
    .action(async (options: DoctorOptions) => {
      const platform = parseDoctorPlatform(options.platform);
      const targets: InstallTarget[] = platform === undefined ? ['codex', 'claude'] : [platform];
      const mode: DoctorMode = options.status ? 'status' : options.verbose ? 'verbose' : 'default';
      await dependencies.execute({
        operation: 'doctor',
        plugins: [],
        targets,
        doctor: { mode, json: options.json ?? false },
      });
      program.setOptionValue('exitCode', 0);
    });

  program
    .command('settings')
    .description('telemetry 설정')
    .action(async () => {
      await dependencies.configureTelemetry();
      program.setOptionValue('exitCode', 0);
    });

  return program;
}

async function install(
  input: PublicCliInput,
  dependencies: PublicCliDependencies,
  options: InstallOptions,
): Promise<number> {
  const initial = parseInstallPlatform(options.platform);
  if (!options.tui) {
    if (initial === undefined || options.plugins === undefined) {
      dependencies.writeError('오류: --no-tui에는 --platform과 --plugins가 모두 필요합니다.\n');
      return 2;
    }
    const plugins = await parsePluginSelection(options.plugins, dependencies);
    if (plugins === undefined) return 2;
    await dependencies.execute({ operation: 'install', plugins, targets: targetsFor(initial) });
    return 0;
  }
  if (!input.stdinTty || !input.stdoutTty) {
    dependencies.writeError('오류: 대화형 설치에는 TTY가 필요합니다. --no-tui를 사용하세요.\n');
    return 1;
  }
  const platform = await dependencies.choosePlatform(initial);
  if (platform === undefined) return 0;
  const plugins = await dependencies.choosePlugins(await dependencies.availablePlugins());
  if (plugins === undefined) return 0;
  await dependencies.execute({ operation: 'install', plugins, targets: targetsFor(platform) });
  return 0;
}

async function update(
  input: PublicCliInput,
  dependencies: PublicCliDependencies,
  options: PlatformOptions,
): Promise<number> {
  const platform = await resolvePlatform(input, dependencies, options.platform);
  if (platform === undefined) return 0;
  await dependencies.execute({ operation: 'update', plugins: [], targets: targetsFor(platform) });
  return 0;
}

async function uninstall(
  input: PublicCliInput,
  dependencies: PublicCliDependencies,
  options: PlatformOptions,
): Promise<number> {
  const platform = await resolvePlatform(input, dependencies, options.platform);
  if (platform === undefined) return 0;
  const targets = targetsFor(platform);
  const plugins = await dependencies.choosePlugins(await dependencies.installedPlugins(targets));
  if (plugins === undefined || plugins.length === 0) return 0;
  if (dependencies.confirm !== undefined && !(await dependencies.confirm('선택한 스킬을 삭제할까요?'))) return 0;
  await dependencies.execute({ operation: 'uninstall', plugins, targets });
  return 0;
}

async function resolvePlatform(
  input: PublicCliInput,
  dependencies: PublicCliDependencies,
  value: string | undefined,
): Promise<InstallPlatform | undefined> {
  const platform = parseInstallPlatform(value);
  if (platform !== undefined) return platform;
  if (!input.stdinTty || !input.stdoutTty) {
    dependencies.writeError('오류: 비대화식 실행에는 --platform이 필요합니다.\n');
    return undefined;
  }
  return dependencies.choosePlatform();
}

async function parsePluginSelection(value: string, dependencies: PublicCliDependencies): Promise<string[] | undefined> {
  if (value === 'none') return [];
  const available = await dependencies.availablePlugins();
  if (value === 'all') return available;
  const selected = [
    ...new Set(
      value
        .split(',')
        .map((plugin) => plugin.trim())
        .filter(Boolean),
    ),
  ];
  const unknown = selected.filter((plugin) => !available.includes(plugin));
  if (unknown.length === 0) return selected;
  dependencies.writeError(`오류: 알 수 없는 스킬: ${unknown.join(', ')}\n`);
  return undefined;
}

function platformOption(description: string): Option {
  return new Option('--platform <platform>', `${description}: codex, claude, both`).choices([
    'codex',
    'claude',
    'both',
  ]);
}

function parseInstallPlatform(value: string | undefined): InstallPlatform | undefined {
  if (value === 'codex' || value === 'claude' || value === 'both') return value;
  return undefined;
}

function parseDoctorPlatform(value: string | undefined): InstallTarget | undefined {
  if (value === 'codex' || value === 'claude') return value;
  return undefined;
}

function targetsFor(platform: InstallPlatform): InstallTarget[] {
  if (platform === 'both') return ['codex', 'claude'];
  return [platform];
}
