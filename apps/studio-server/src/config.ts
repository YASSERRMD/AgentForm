export interface StudioServerConfig {
  readonly rootDir: string;
  readonly port: number;
}

const DEFAULT_PORT = 4310;

/**
 * Studio serves exactly one project directory per process — the same
 * "one CLI invocation, one `--cwd`" model as `agentform`, not a
 * multi-tenant server. `AGENTFORM_STUDIO_ROOT` mirrors that flag for a
 * long-running process; there is no per-request project selection.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): StudioServerConfig {
  const rootDir = env.AGENTFORM_STUDIO_ROOT ?? process.cwd();
  const port = env.AGENTFORM_STUDIO_PORT ? Number(env.AGENTFORM_STUDIO_PORT) : DEFAULT_PORT;
  return { rootDir, port };
}
