import { createAnthropicProvider, type GenAIProvider } from '@agentform/studio-genai';
import { createLocalDemoProvider } from './local-demo-provider.js';

export type GenAIProviderName = 'anthropic' | 'local-demo';

/**
 * Turns the resolved `genaiProviderName` (see config.ts) into a live
 * `GenAIProvider`. Kept separate from config.ts, which only parses env
 * vars into plain data (mirroring `rootDir`/`port`/`devOrigin`) —
 * constructing a real provider is a different responsibility, split out
 * so it's independently testable and independently injectable into
 * `buildApp`/tests the same way `fs`/`fileWriter` already are.
 *
 * `createAnthropicProvider()` never throws here even with no API key
 * present (verified directly against the installed SDK's constructor —
 * see providers/anthropic-provider.ts in studio-genai): auth is only
 * resolved lazily, at the first real `generate()` call. So the default
 * ('anthropic') is always safe to construct at server startup; a missing
 * key surfaces as a clean, catchable error the moment GenAI is actually
 * used, not as a startup crash.
 */
export function resolveGenAIProvider(name: GenAIProviderName): GenAIProvider {
  return name === 'local-demo' ? createLocalDemoProvider() : createAnthropicProvider();
}
