import type { GenAIProvider, GenAIRequest } from '../provider.js';

export interface FakeProviderOptions {
  /** Consumed one per `generate()` call, in order. Throws once exhausted rather than looping, so a test can assert exactly how many calls happened. */
  readonly responses: readonly unknown[];
}

export interface FakeProvider extends GenAIProvider {
  readonly requests: readonly GenAIRequest<unknown>[];
}

/**
 * Fully scriptable, deterministic, never touches a network — the only
 * provider the automated test suite exercises. Still validates each
 * scripted response against the real Zod schema the caller asked for
 * (`schema.parse`), the same way the real Anthropic provider's structured
 * output is validated, so a test using a malformed fixture fails loudly
 * instead of silently passing through bad data.
 */
export function createFakeProvider(options: FakeProviderOptions): FakeProvider {
  const requests: GenAIRequest<unknown>[] = [];
  let index = 0;
  return {
    name: 'fake',
    requests,
    async generate(request) {
      requests.push(request);
      if (index >= options.responses.length) {
        throw new Error(
          `FakeProvider: no scripted response left for call ${index + 1} (only ${options.responses.length} provided)`,
        );
      }
      const raw = options.responses[index];
      index += 1;
      return request.schema.parse(raw);
    },
  };
}
