import { describe, expect, it } from 'vitest';
import { jsonSchemaToPythonParams } from './json-schema-to-python.js';

describe('jsonSchemaToPythonParams', () => {
  it('falls back to **kwargs: Any for an empty or unrecognized schema', () => {
    expect(jsonSchemaToPythonParams(undefined)).toBe('**kwargs: Any');
    expect(jsonSchemaToPythonParams({})).toBe('**kwargs: Any');
    expect(jsonSchemaToPythonParams({ type: 'string' })).toBe('**kwargs: Any');
  });

  it('converts primitive property types', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        ratio: { type: 'number' },
        active: { type: 'boolean' },
      },
      required: ['name', 'count', 'ratio', 'active'],
    });
    expect(params).toBe('name: str, count: int, ratio: float, active: bool');
  });

  it('orders required parameters before optional ones regardless of declaration order', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        query: { type: 'string' },
      },
      required: ['query'],
    });
    expect(params).toBe('query: str, limit: Optional[int] = None');
  });

  it('converts array and object properties one level deep', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
        untyped: { type: 'array' },
        metadata: { type: 'object' },
      },
      required: ['tags', 'untyped', 'metadata'],
    });
    expect(params).toBe('tags: list[str], untyped: list[Any], metadata: dict[str, Any]');
  });

  it('converts an enum to a Literal type', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: { mode: { type: 'string', enum: ['fast', 'slow'] } },
      required: ['mode'],
    });
    expect(params).toBe('mode: Literal["fast", "slow"]');
  });

  it('sanitizes hyphenated property names into valid Python identifiers', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: { 'user-id': { type: 'string' } },
      required: ['user-id'],
    });
    expect(params).toBe('user_id: str');
  });

  it('defaults an unrecognized property type to Any', () => {
    const params = jsonSchemaToPythonParams({
      type: 'object',
      properties: { anything: {} },
      required: ['anything'],
    });
    expect(params).toBe('anything: Any');
  });
});
