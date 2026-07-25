import type { GenAIProviderName } from './lib/genai-provider.js';

export interface StudioServerConfig {
  readonly rootDir: string;
  readonly port: number;
  readonly devOrigin: string;
  readonly genaiProviderName: GenAIProviderName;
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
 *
 * `genaiProviderName` defaults to `'anthropic'`, not a key-free stand-in
 * — the only provider that does real work, and constructing it is always
 * safe with no key present (see lib/genai-provider.ts). Set
 * `AGENTFORM_STUDIO_GENAI_PROVIDER=local-demo` to run GenAI in a
 * no-network, no-key demo mode instead (e.g. for trying the UI, or CI/
 * browser verification, without burning real API credits).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): StudioServerConfig {
  const rootDir = env.AGENTFORM_STUDIO_ROOT ?? process.cwd();
  const port = env.AGENTFORM_STUDIO_PORT ? Number(env.AGENTFORM_STUDIO_PORT) : DEFAULT_PORT;
  const devOrigin = env.AGENTFORM_STUDIO_DEV_ORIGIN ?? DEFAULT_DEV_ORIGIN;
  const genaiProviderName: GenAIProviderName =
    env.AGENTFORM_STUDIO_GENAI_PROVIDER === 'local-demo' ? 'local-demo' : 'anthropic';
  return { rootDir, port, devOrigin, genaiProviderName };
}
