import type { GenAIProviderName } from './lib/genai-provider.js';

export interface StudioServerConfig {
  readonly rootDir: string;
  readonly port: number;
  readonly devOrigin: string;
  readonly genaiProviderName: GenAIProviderName;
  /** Unset (the default) disables auth entirely — see lib/auth.ts, app.ts, ADR-0022. */
  readonly authToken?: string;
}

const DEFAULT_PORT = 4310;
const DEFAULT_DEV_ORIGIN = 'http://localhost:5173';
const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_RECOMMENDED_TOKEN_LENGTH = 16;
const GENAI_PROVIDER_NAMES: readonly GenAIProviderName[] = ['anthropic', 'local-demo'];

/** Thrown at startup for a malformed env var — never guessed at or silently downgraded to a default, matching this repo's "fail loud" convention for configuration this codebase can't safely infer. */
export class StudioConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioConfigError';
  }
}

function parsePort(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
    throw new StudioConfigError(
      `AGENTFORM_STUDIO_PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${raw}".`,
    );
  }
  return parsed;
}

function parseGenAIProviderName(raw: string | undefined): GenAIProviderName {
  if (!raw) {
    return 'anthropic';
  }
  if ((GENAI_PROVIDER_NAMES as readonly string[]).includes(raw)) {
    return raw as GenAIProviderName;
  }
  throw new StudioConfigError(
    `AGENTFORM_STUDIO_GENAI_PROVIDER must be one of ${GENAI_PROVIDER_NAMES.join(', ')}, got "${raw}".`,
  );
}

/** Blank/whitespace-only is treated as unset, not an empty-but-present token. A short token only warns (never throws) — it's a usability nudge, not a validity requirement. */
function parseAuthToken(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length < MIN_RECOMMENDED_TOKEN_LENGTH) {
    console.warn(
      `AGENTFORM_STUDIO_TOKEN is shorter than the recommended ${MIN_RECOMMENDED_TOKEN_LENGTH} characters — consider a longer, random value (e.g. \`openssl rand -hex 32\`).`,
    );
  }
  return trimmed;
}

/**
 * Studio serves exactly one project directory per process — the same
 * "one CLI invocation, one `--cwd`" model as `agentform`, not a
 * multi-tenant server. `AGENTFORM_STUDIO_ROOT` mirrors that flag for a
 * long-running process; there is no per-request project selection.
 * `devOrigin` is the single allowed CORS origin (defense-in-depth
 * against an arbitrary webpage reaching this service — one of two such
 * layers alongside the opt-in `authToken` below), defaulting to Vite's
 * own default dev port.
 *
 * `genaiProviderName` defaults to `'anthropic'`, not a key-free stand-in
 * — the only provider that does real work, and constructing it is always
 * safe with no key present (see lib/genai-provider.ts). Set
 * `AGENTFORM_STUDIO_GENAI_PROVIDER=local-demo` to run GenAI in a
 * no-network, no-key demo mode instead (e.g. for trying the UI, or CI/
 * browser verification, without burning real API credits). An
 * unrecognized non-empty value throws `StudioConfigError` at startup
 * rather than silently falling back — same for an invalid
 * `AGENTFORM_STUDIO_PORT` — matching this repo's "fail loud, never
 * silently guess" convention elsewhere (e.g. `agentform`'s own CLI
 * argument validation).
 *
 * `authToken` (`AGENTFORM_STUDIO_TOKEN`) is unset by default — Studio
 * runs exactly as it always has, with zero configuration required. Set
 * it to require a matching bearer token on every request; see
 * lib/auth.ts, app.ts, and ADR-0022 for what this closes (reaching the
 * port from a different machine — e.g. via port-forwarding, a
 * devcontainer, or a codespace — no longer implies filesystem access to
 * `agentform.yaml` the way it does on the same machine).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): StudioServerConfig {
  const rootDir = env.AGENTFORM_STUDIO_ROOT ?? process.cwd();
  const port = parsePort(env.AGENTFORM_STUDIO_PORT);
  const devOrigin = env.AGENTFORM_STUDIO_DEV_ORIGIN ?? DEFAULT_DEV_ORIGIN;
  const genaiProviderName = parseGenAIProviderName(env.AGENTFORM_STUDIO_GENAI_PROVIDER);
  const authToken = parseAuthToken(env.AGENTFORM_STUDIO_TOKEN);
  return { rootDir, port, devOrigin, genaiProviderName, authToken };
}
