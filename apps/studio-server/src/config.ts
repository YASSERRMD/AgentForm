export interface StudioServerConfig {
  readonly rootDir: string;
  readonly port: number;
  readonly devOrigin: string;
}

const DEFAULT_PORT = 4310;
const DEFAULT_DEV_ORIGIN = 'http://localhost:5173';

/**
 * Studio serves exactly one project directory per process — the same
 * "one CLI invocation, one `--cwd`" model as `agentform`, not a
 * multi-tenant server. `AGENTFORM_STUDIO_ROOT` mirrors that flag for a
 * long-running process; there is no per-request project selection.
 * `devOrigin` is the single allowed CORS origin (defense-in-depth
 * against an arbitrary webpage reaching this no-auth local service —
 * not itself an auth mechanism), defaulting to Vite's own default dev
 * port.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): StudioServerConfig {
  const rootDir = env.AGENTFORM_STUDIO_ROOT ?? process.cwd();
  const port = env.AGENTFORM_STUDIO_PORT ? Number(env.AGENTFORM_STUDIO_PORT) : DEFAULT_PORT;
  const devOrigin = env.AGENTFORM_STUDIO_DEV_ORIGIN ?? DEFAULT_DEV_ORIGIN;
  return { rootDir, port, devOrigin };
}
