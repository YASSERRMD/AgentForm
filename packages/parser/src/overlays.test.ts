import { describe, expect, it } from 'vitest';
import { mergeOverlay } from './overlays.js';

describe('mergeOverlay', () => {
  it('deep-merges an existing resource by identifier rather than replacing it wholesale', () => {
    const base = {
      spec: { models: { primary: { provider: 'openai', model: 'gpt-5', temperature: 0 } } },
    };
    const overlay = { spec: { models: { primary: { temperature: 0.7 } } } };

    expect(mergeOverlay(base, overlay)).toEqual({
      spec: { models: { primary: { provider: 'openai', model: 'gpt-5', temperature: 0.7 } } },
    });
  });

  it('adds a new resource under an existing collection without disturbing siblings', () => {
    const base = { spec: { models: { primary: { provider: 'openai', model: 'gpt-5' } } } };
    const overlay = { spec: { models: { fallback: { provider: 'anthropic', model: 'claude' } } } };

    expect(mergeOverlay(base, overlay)).toEqual({
      spec: {
        models: {
          primary: { provider: 'openai', model: 'gpt-5' },
          fallback: { provider: 'anthropic', model: 'claude' },
        },
      },
    });
  });

  it('replaces arrays entirely rather than concatenating them', () => {
    const base = { spec: { policies: ['policy-a', 'policy-b'] } };
    const overlay = { spec: { policies: ['policy-c'] } };

    expect(mergeOverlay(base, overlay)).toEqual({ spec: { policies: ['policy-c'] } });
  });

  it('replaces a scalar with the overlay value', () => {
    expect(
      mergeOverlay(
        { spec: { runtime: { environment: 'development' } } },
        { spec: { runtime: { environment: 'production' } } },
      ),
    ).toEqual({
      spec: { runtime: { environment: 'production' } },
    });
  });

  it('leaves the base untouched when the overlay omits a key', () => {
    const base = { metadata: { name: 'app', version: '1.0.0' } };
    expect(mergeOverlay(base, { metadata: { version: '1.0.1' } })).toEqual({
      metadata: { name: 'app', version: '1.0.1' },
    });
  });

  it('returns the base unchanged when the overlay is undefined', () => {
    const base = { metadata: { name: 'app' } };
    expect(mergeOverlay(base, undefined)).toBe(base);
  });
});
