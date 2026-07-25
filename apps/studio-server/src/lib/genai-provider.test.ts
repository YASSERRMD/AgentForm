import { describe, expect, it } from 'vitest';
import { resolveGenAIProvider } from './genai-provider.js';

describe('resolveGenAIProvider', () => {
  it('resolves "anthropic" to the real Anthropic-backed provider', () => {
    expect(resolveGenAIProvider('anthropic').name).toBe('anthropic');
  });

  it('resolves "local-demo" to the key-free demo provider', () => {
    expect(resolveGenAIProvider('local-demo').name).toBe('local-demo');
  });

  it('constructing the "anthropic" provider never throws, even with no API key present', () => {
    expect(() => resolveGenAIProvider('anthropic')).not.toThrow();
  });
});
