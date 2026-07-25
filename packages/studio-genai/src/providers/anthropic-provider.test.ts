import { describe, expect, it } from 'vitest';
import { createAnthropicProvider } from './anthropic-provider.js';

/**
 * Structural checks only — never calls `.generate()` for real. The
 * Anthropic SDK client does not touch the network or validate credentials
 * until a request is actually issued (verified directly against the
 * installed SDK's constructor before writing this), so constructing the
 * provider with no key present is safe to test even in an environment
 * with no `ANTHROPIC_API_KEY` set. Live generation is an explicit,
 * separate, user-initiated step — see the doc comment on the source file.
 */
describe('createAnthropicProvider', () => {
  it('constructs without throwing when no API key is configured anywhere', () => {
    expect(() => createAnthropicProvider()).not.toThrow();
  });

  it('reports its provider name as "anthropic"', () => {
    const provider = createAnthropicProvider();
    expect(provider.name).toBe('anthropic');
  });

  it('exposes a generate function', () => {
    const provider = createAnthropicProvider();
    expect(typeof provider.generate).toBe('function');
  });

  it('accepts an explicit apiKey, model, and maxTokens without throwing', () => {
    expect(() =>
      createAnthropicProvider({
        apiKey: 'test-key-not-real',
        model: 'claude-opus-5',
        maxTokens: 1024,
      }),
    ).not.toThrow();
  });
});
