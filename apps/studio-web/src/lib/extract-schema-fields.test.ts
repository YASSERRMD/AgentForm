import { describe, expect, it } from 'vitest';
import { extractSchemaFields } from './extract-schema-fields';

describe('extractSchemaFields', () => {
  it('extracts top-level property keys in declaration order', () => {
    const fields = extractSchemaFields({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
    });
    expect(fields).toEqual([
      { path: 'name', label: 'name' },
      { path: 'age', label: 'age' },
    ]);
  });

  it("uses a property's title as the label when present", () => {
    const fields = extractSchemaFields({
      properties: { name: { title: 'Full Name' } },
    });
    expect(fields).toEqual([{ path: 'name', label: 'Full Name' }]);
  });

  it('returns an empty list for undefined', () => {
    expect(extractSchemaFields(undefined)).toEqual([]);
  });

  it('returns an empty list for a non-object value', () => {
    expect(extractSchemaFields('not a schema')).toEqual([]);
  });

  it('returns an empty list when there is no properties key', () => {
    expect(extractSchemaFields({ type: 'string' })).toEqual([]);
  });

  it('returns an empty list when properties is not an object', () => {
    expect(extractSchemaFields({ properties: 'oops' })).toEqual([]);
  });
});
