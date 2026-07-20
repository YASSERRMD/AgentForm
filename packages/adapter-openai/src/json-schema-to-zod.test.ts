import { describe, expect, it } from 'vitest';
import { jsonSchemaToZodExpression } from './json-schema-to-zod.js';

describe('jsonSchemaToZodExpression', () => {
  it('falls back to an empty object schema for an empty or missing schema', () => {
    expect(jsonSchemaToZodExpression(undefined)).toBe('z.object({})');
    expect(jsonSchemaToZodExpression({})).toBe('z.object({})');
  });

  it('converts a simple object schema with required and optional fields', () => {
    const result = jsonSchemaToZodExpression({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    });
    expect(result).toContain('"query": z.string(),');
    expect(result).toContain('"limit": z.number().optional(),');
  });

  it('includes a description via .describe()', () => {
    const result = jsonSchemaToZodExpression({
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query' } },
      required: ['query'],
    });
    expect(result).toContain('.describe("The search query")');
  });

  it('converts an enum field', () => {
    const result = jsonSchemaToZodExpression({
      type: 'object',
      properties: { status: { enum: ['open', 'closed'] } },
      required: ['status'],
    });
    expect(result).toContain('z.enum(["open", "closed"])');
  });

  it('converts an array field with typed items', () => {
    const result = jsonSchemaToZodExpression({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    });
    expect(result).toContain('z.array(z.string())');
  });

  it('produces balanced braces for a nested object', () => {
    const result = jsonSchemaToZodExpression({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    });
    const opens = (result.match(/\{/g) ?? []).length;
    const closes = (result.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
