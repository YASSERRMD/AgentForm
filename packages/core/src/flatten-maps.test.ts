import { describe, expect, it } from 'vitest';
import { flattenMaps } from './flatten-maps.js';

describe('flattenMaps', () => {
  it('converts a top-level Map into a plain object', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(flattenMaps(map)).toEqual({ a: 1, b: 2 });
  });

  it('converts a nested Map inside a plain object', () => {
    const value = { entrypoint: 'intake', nodes: new Map([['intake', { type: 'agent' }]]) };
    expect(flattenMaps(value)).toEqual({
      entrypoint: 'intake',
      nodes: { intake: { type: 'agent' } },
    });
  });

  it('converts a Map nested inside an array', () => {
    const value = [new Map([['x', 1]]), new Map([['y', 2]])];
    expect(flattenMaps(value)).toEqual([{ x: 1 }, { y: 2 }]);
  });

  it('is JSON.stringify-safe after conversion, unlike the original Map (which silently becomes {})', () => {
    const withMap = { nodes: new Map([['intake', { type: 'agent' }]]) };
    expect(JSON.parse(JSON.stringify(withMap))).toEqual({ nodes: {} }); // the bug this fixes
    expect(JSON.parse(JSON.stringify(flattenMaps(withMap)))).toEqual({
      nodes: { intake: { type: 'agent' } },
    });
  });

  it('preserves Map insertion order rather than sorting keys', () => {
    const map = new Map([
      ['zebra', 1],
      ['apple', 2],
    ]);
    expect(Object.keys(flattenMaps(map) as Record<string, unknown>)).toEqual(['zebra', 'apple']);
  });

  it('leaves primitives, null, and plain values untouched', () => {
    expect(flattenMaps('hello')).toBe('hello');
    expect(flattenMaps(42)).toBe(42);
    expect(flattenMaps(true)).toBe(true);
    expect(flattenMaps(null)).toBe(null);
    expect(flattenMaps(undefined)).toBe(undefined);
  });

  it('handles deeply nested combinations of Maps, arrays, and objects', () => {
    const value = new Map([
      [
        'workflows',
        new Map([
          [
            'main',
            {
              entrypoint: 'intake',
              nodes: new Map([['intake', { type: 'agent' }]]),
              edges: [{ from: 'intake', to: 'done' }],
            },
          ],
        ]),
      ],
    ]);
    expect(flattenMaps(value)).toEqual({
      workflows: {
        main: {
          entrypoint: 'intake',
          nodes: { intake: { type: 'agent' } },
          edges: [{ from: 'intake', to: 'done' }],
        },
      },
    });
  });
});
