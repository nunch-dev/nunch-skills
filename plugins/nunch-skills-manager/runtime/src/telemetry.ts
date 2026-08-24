import { PostHog } from 'posthog-node';

type TelemetryInput = {
  cliVersion: string;
  os: string;
  arch: string;
  operation: 'install' | 'update' | 'uninstall' | 'doctor';
  result: 'success' | 'failure' | 'cancel';
  errorCode: string;
  durationMs: number;
  pluginIds: string[];
};

type TelemetryProperties = {
  cli_version: string;
  os: string;
  arch: string;
  operation: TelemetryInput['operation'];
  result: TelemetryInput['result'];
  error_code: string;
  duration_bucket: string;
  plugin_count: number;
  plugin_ids: string[];
  $process_person_profile: false;
};

export interface TelemetrySink {
  capture(installationId: string, properties: TelemetryProperties): Promise<void>;
}

type TelemetryOptions = {
  enabled: boolean;
  installationId: string;
  sink: TelemetrySink;
  diagnostic?: (event: string) => Promise<void>;
};

export function telemetryProperties(input: TelemetryInput): TelemetryProperties {
  return {
    cli_version: input.cliVersion,
    os: input.os,
    arch: input.arch,
    operation: input.operation,
    result: input.result,
    error_code: input.errorCode,
    duration_bucket: durationBucket(input.durationMs),
    plugin_count: input.pluginIds.length,
    plugin_ids: [...input.pluginIds].sort(),
    $process_person_profile: false,
  };
}

export class Telemetry {
  options: TelemetryOptions;

  constructor(options: TelemetryOptions) {
    this.options = options;
  }

  async capture(input: TelemetryInput): Promise<void> {
    if (!this.options.enabled) return;
    try {
      await this.options.sink.capture(this.options.installationId, telemetryProperties(input));
    } catch (error) {
      if (error instanceof Error) {
        await this.writeDiagnostic(error);
        return;
      }
      await this.writeDiagnostic(new Error('telemetry sink threw a non-Error value'));
    }
  }

  private async writeDiagnostic(error: unknown): Promise<void> {
    if (this.options.diagnostic === undefined) return;
    try {
      await this.options.diagnostic(error instanceof Error ? error.name : 'NonErrorFailure');
    } catch (diagnosticError) {
      if (diagnosticError instanceof Error) return;
    }
  }
}

export class PostHogSink implements TelemetrySink {
  client: PostHog;

  constructor(projectToken: string, host: string) {
    this.client = new PostHog(projectToken, { host, flushAt: 1, flushInterval: 0, disableGeoip: true });
  }

  async capture(installationId: string, properties: TelemetryProperties): Promise<void> {
    this.client.capture({ distinctId: installationId, event: 'nunch_skills_lifecycle', properties });
    await this.client.shutdown();
  }
}

function durationBucket(milliseconds: number): string {
  if (milliseconds < 1000) return '<1s';
  if (milliseconds < 5000) return '1s-5s';
  if (milliseconds < 30_000) return '5s-30s';
  if (milliseconds < 120_000) return '30s-2m';
  return '>=2m';
}
