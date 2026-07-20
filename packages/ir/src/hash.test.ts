import { describe, expect, it } from 'vitest';
import { canonicalStringify, computeContentHash } from './hash.js';

describe('canonicalStringify', () => {
  it('sorts object keys regardless of insertion order', () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts nested object keys recursively', () => {
    expect(canonicalStringify({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  it('normalizes Map iteration order the same way as object key order', () => {
    const first = new Map([
      ['b', 1],
      ['a', 2],
    ]);
    const second = new Map([
      ['a', 2],
      ['b', 1],
    ]);
    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
  });

  it('preserves array element order (arrays are ordered, unlike objects/maps)', () => {
    expect(canonicalStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('computeContentHash', () => {
  it('is stable: hashing the same value twice gives the same hash', () => {
    const value = { models: new Map([['primary', { provider: 'openai', model: 'gpt-5' }]]) };
    expect(computeContentHash(value)).toBe(computeContentHash(value));
  });

  it('is insensitive to object key order (equivalent formatting)', () => {
    const a = { name: 'app', version: '1.0.0' };
    const b = { version: '1.0.0', name: 'app' };
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('is insensitive to Map/resource insertion order', () => {
    const a = new Map([
      ['primary', { model: 'gpt-5' }],
      ['fallback', { model: 'gpt-4' }],
    ]);
    const b = new Map([
      ['fallback', { model: 'gpt-4' }],
      ['primary', { model: 'gpt-5' }],
    ]);
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('changes when a resolved value actually changes', () => {
    const a = computeContentHash({ model: 'gpt-5' });
    const b = computeContentHash({ model: 'gpt-5.1' });
    expect(a).not.toBe(b);
  });

  it('changes when prompt/instructions text changes', () => {
    const a = computeContentHash({ instructions: { text: 'You are helpful.' } });
    const b = computeContentHash({ instructions: { text: 'You are extremely helpful.' } });
    expect(a).not.toBe(b);
  });

  it('is formatted as sha256:<64 hex chars>', () => {
    const hash = computeContentHash({ a: 1 });
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
