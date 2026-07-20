import { describe, expect, it } from 'vitest';
import { toPlainObject } from './serialize.js';

describe('toPlainObject', () => {
  it('converts a Map to a plain object', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(toPlainObject(map)).toEqual({ a: 1, b: 2 });
  });

  it('converts nested Maps recursively', () => {
    const inner = new Map([['x', 1]]);
    const outer = new Map([['nested', inner]]);
    expect(toPlainObject(outer)).toEqual({ nested: { x: 1 } });
  });

  it('preserves Map insertion order rather than sorting', () => {
    const map = new Map([
      ['z', 1],
      ['a', 2],
    ]);
    expect(Object.keys(toPlainObject(map) as Record<string, unknown>)).toEqual(['z', 'a']);
  });

  it('recurses into arrays', () => {
    const value = [new Map([['x', 1]]), 2];
    expect(toPlainObject(value)).toEqual([{ x: 1 }, 2]);
  });

  it('recurses into plain objects', () => {
    expect(toPlainObject({ a: new Map([['b', 1]]) })).toEqual({ a: { b: 1 } });
  });

  it('leaves scalars untouched', () => {
    expect(toPlainObject('hello')).toBe('hello');
    expect(toPlainObject(42)).toBe(42);
    expect(toPlainObject(null)).toBe(null);
    expect(toPlainObject(undefined)).toBe(undefined);
  });
});
