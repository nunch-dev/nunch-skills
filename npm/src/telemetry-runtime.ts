import { join } from 'node:path';

import { PostHogSink, Telemetry } from '../../plugins/nch-installer/runtime/src/telemetry.ts';
import {
  appendTelemetryDiagnostic,
  loadTelemetryState,
} from '../../plugins/nch-installer/runtime/src/telemetry-state.ts';
import type { CliOperation } from './public-cli.ts';
import { cliVersion } from './runtime-config.ts';

const defaultPostHogToken = 'phc_y6J93Cm3iYyKU8ZkkZzXEQTsKqpDv2PFabNKZUQDk9eP';
const defaultPostHogHost = 'https://us.i.posthog.com';

export async function captureTelemetry(
  operation: Exclude<CliOperation, 'cancel' | 'settings'>,
  plugins: string[],
  result: 'success' | 'failure',
  durationMs: number,
  dataRoot: string,
): Promise<void> {
  try {
    await captureTelemetryEvent(operation, plugins, result, durationMs, dataRoot);
  } catch (error) {
    if (error instanceof Error) return;
    return;
  }
}

async function captureTelemetryEvent(
  operation: Exclude<CliOperation, 'cancel' | 'settings'>,
  plugins: string[],
  result: 'success' | 'failure',
  durationMs: number,
  dataRoot: string,
): Promise<void> {
  const state = await loadTelemetryState(
    join(dataRoot, 'telemetry.json'),
    process.env['NUNCH_SKILLS_TELEMETRY_DISABLED'] === '1',
  );
  const sink = postHogSink();
  if (!state.enabled || sink === undefined) return;
  await new Telemetry({
    enabled: true,
    installationId: state.installationId,
    sink,
    diagnostic: (event) => appendTelemetryDiagnostic(join(dataRoot, 'telemetry-diagnostics.jsonl'), event, Date.now()),
  }).capture({
    cliVersion,
    os: process.platform,
    arch: process.arch,
    operation,
    result,
    errorCode: result === 'success' ? 'none' : 'lifecycle_failed',
    durationMs,
    pluginIds: plugins,
  });
}

function postHogSink(): PostHogSink | undefined {
  const token = process.env['NUNCH_SKILLS_POSTHOG_TOKEN'] ?? defaultPostHogToken;
  if (token.length === 0) return undefined;
  return new PostHogSink(token, process.env['NUNCH_SKILLS_POSTHOG_HOST'] ?? defaultPostHogHost);
}
