import { describe, expect, it } from 'vitest';
import { substituteInputs } from './input-substitution.js';

describe('substituteInputs', () => {
  it('leaves a plain string with no placeholders untouched', () => {
    const result = substituteInputs('hello world', {});
    expect(result).toEqual({ value: 'hello world', missing: [] });
  });

  it('preserves the original type for a whole-string substitution', () => {
    expect(substituteInputs('${input.count}', { count: 3 }).value).toBe(3);
    expect(substituteInputs('${input.enabled}', { enabled: true }).value).toBe(true);
    expect(substituteInputs('${input.config}', { config: { a: 1 } }).value).toEqual({ a: 1 });
  });

  it('coerces to string when embedded in a larger string', () => {
    const result = substituteInputs('region: ${input.region}', { region: 'us-east' });
    expect(result.value).toBe('region: us-east');
  });

  it('substitutes multiple placeholders in one string', () => {
    const result = substituteInputs('${input.a}-${input.b}', { a: 'x', b: 'y' });
    expect(result.value).toBe('x-y');
  });

  it('reports a missing input and leaves the placeholder in place', () => {
    const result = substituteInputs('${input.missing}', {});
    expect(result.value).toBe('${input.missing}');
    expect(result.missing).toEqual(['missing']);
  });

  it('recurses into nested objects and arrays', () => {
    const result = substituteInputs(
      { agent: { instructions: { text: 'Serve ${input.region}.' }, tags: ['${input.tag}'] } },
      { region: 'us-east', tag: 'prod' },
    );
    expect(result.value).toEqual({
      agent: { instructions: { text: 'Serve us-east.' }, tags: ['prod'] },
    });
    expect(result.missing).toEqual([]);
  });

  it('collects every missing input across a nested structure', () => {
    const result = substituteInputs({ a: '${input.x}', b: ['${input.y}'] }, {});
    expect([...result.missing].sort()).toEqual(['x', 'y']);
  });

  it('leaves non-string leaves (numbers, booleans, null) untouched', () => {
    const result = substituteInputs({ n: 5, b: true, nul: null }, {});
    expect(result.value).toEqual({ n: 5, b: true, nul: null });
  });
});
