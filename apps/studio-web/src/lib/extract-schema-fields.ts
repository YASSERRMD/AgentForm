import { isRecord } from './json-schema-utils';

export interface ExtractedField {
  readonly path: string;
  readonly label: string;
}

/**
 * Best-effort: an agent's inputSchema/outputSchema is an unenforced
 * Record<string,unknown> (verified against the real Zod schema — see
 * ADR-0019, not assumed structured). A field list can only be extracted
 * when the value is actually shaped like a JSON Schema object
 * ({properties: {...}}), by convention rather than by any guarantee.
 * Anything else — undefined, a non-object, a schema with no properties —
 * yields an empty list rather than a guess.
 */
export function extractSchemaFields(schemaValue: unknown): readonly ExtractedField[] {
  if (!isRecord(schemaValue) || !isRecord(schemaValue.properties)) {
    return [];
  }
  return Object.entries(schemaValue.properties).map(([path, definition]) => ({
    path,
    label: isRecord(definition) && typeof definition.title === 'string' ? definition.title : path,
  }));
}
