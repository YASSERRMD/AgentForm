import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateJsonSchema } from './json-schema.js';
import { API_VERSION } from './application.js';

const committedSchemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../specifications/v1alpha1/agentic-application.schema.json',
);

describe('generateJsonSchema', () => {
  it('produces byte-identical output across repeated calls (deterministic)', () => {
    const first = JSON.stringify(generateJsonSchema());
    const second = JSON.stringify(generateJsonSchema());
    expect(first).toBe(second);
  });

  it('carries the v1alpha1 identifiers', () => {
    const schema = generateJsonSchema();
    expect(schema.$id).toBe(
      `https://schema.agentform.dev/${API_VERSION}/agentic-application.schema.json`,
    );
    expect(schema.title).toBe('AgenticApplication');
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('stays in parity with the Zod schema: required root properties', () => {
    const schema = generateJsonSchema() as {
      properties: Record<string, { const?: string; enum?: string[] }>;
      required: string[];
    };

    expect(schema.required).toEqual(
      expect.arrayContaining(['apiVersion', 'kind', 'metadata', 'spec']),
    );

    const apiVersionProperty = schema.properties.apiVersion;
    expect(apiVersionProperty).toBeDefined();
    expect(apiVersionProperty?.const ?? apiVersionProperty?.enum?.[0]).toBe(API_VERSION);
  });

  it('stays in parity with the Zod schema: tool discriminated union carries all nine types', () => {
    const schema = generateJsonSchema() as {
      $defs?: Record<string, unknown>;
      definitions?: Record<string, unknown>;
    };
    const serialized = JSON.stringify(schema);

    for (const toolType of [
      'mcp',
      'http',
      'openapi',
      'function',
      'database',
      'queue',
      'agent',
      'humanApproval',
      'customPlugin',
    ]) {
      expect(serialized).toContain(toolType);
    }
  });

  it('matches the committed specifications/v1alpha1/agentic-application.schema.json exactly', () => {
    const committed = readFileSync(committedSchemaPath, 'utf-8');
    const regenerated = `${JSON.stringify(generateJsonSchema(), null, 2)}\n`;
    expect(regenerated).toBe(committed);
  });
});
