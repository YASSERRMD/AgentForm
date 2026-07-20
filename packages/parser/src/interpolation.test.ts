import { describe, expect, it } from 'vitest';
import {
  interpolateString,
  interpolateValue,
  type InterpolationResolver,
} from './interpolation.js';

const resolver: InterpolationResolver = (namespace, identifier) => {
  if (namespace === 'env' && identifier === 'API_URL')
    return { found: true, value: 'https://api.example.com' };
  if (namespace === 'var' && identifier === 'region') return { found: true, value: 'us-east-1' };
  if (namespace === 'var' && identifier === 'maxTokens') return { found: true, value: 4096 };
  if (namespace === 'local' && identifier === 'fullRegion')
    return { found: true, value: 'aws-us-east-1' };
  return { found: false };
};

describe('interpolateString', () => {
  it('returns plain text with no interpolations unchanged', () => {
    const result = interpolateString('just plain text', resolver, []);
    expect(result).toEqual({ value: 'just plain text', diagnostics: [] });
  });

  it('resolves a whole-string interpolation and preserves the resolved value type', () => {
    const result = interpolateString('${var.maxTokens}', resolver, [
      'spec',
      'models',
      'primary',
      'maxTokens',
    ]);
    expect(result.value).toBe(4096);
    expect(typeof result.value).toBe('number');
    expect(result.diagnostics).toEqual([]);
  });

  it('coerces an embedded interpolation to a string when there is surrounding text', () => {
    const result = interpolateString('${env.API_URL}/complaints', resolver, []);
    expect(result.value).toBe('https://api.example.com/complaints');
  });

  it('resolves multiple interpolations within one string', () => {
    const result = interpolateString('${var.region}-${local.fullRegion}', resolver, []);
    expect(result.value).toBe('us-east-1-aws-us-east-1');
  });

  it('reports AGF1009 for an unset env variable and leaves the text unchanged', () => {
    const result = interpolateString('${env.MISSING}', resolver, ['spec', 'endpoint']);
    expect(result.value).toBe('${env.MISSING}');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1009');
    expect(result.diagnostics[0]?.path).toEqual(['spec', 'endpoint']);
  });

  it('reports AGF1006 for an undeclared/defaultless variable', () => {
    const result = interpolateString('${var.missing}', resolver, []);
    expect(result.diagnostics[0]?.code).toBe('AGF1006');
  });

  it('reports AGF1007 for an unknown namespace', () => {
    const result = interpolateString('${bogus.name}', resolver, []);
    expect(result.diagnostics[0]?.code).toBe('AGF1007');
    expect(result.value).toBe('${bogus.name}');
  });

  it('reports AGF1008 for a malformed body in a known namespace', () => {
    const result = interpolateString('${env.INVALID-NAME}', resolver, []);
    expect(result.diagnostics[0]?.code).toBe('AGF1008');
  });
});

describe('interpolateValue', () => {
  it('recurses through nested objects and arrays, tracking field paths', () => {
    const result = interpolateValue(
      {
        endpoint: '${env.API_URL}',
        regions: ['${var.region}', 'eu-west-1'],
        nested: { deep: '${local.fullRegion}' },
      },
      resolver,
    );

    expect(result.value).toEqual({
      endpoint: 'https://api.example.com',
      regions: ['us-east-1', 'eu-west-1'],
      nested: { deep: 'aws-us-east-1' },
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('leaves non-string leaves untouched', () => {
    const result = interpolateValue({ enabled: true, count: 3, note: null }, resolver);
    expect(result.value).toEqual({ enabled: true, count: 3, note: null });
  });
});
