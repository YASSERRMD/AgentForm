import { describe, expect, it } from 'vitest';
import {
  generateAllResourceFormSchemas,
  generateResourceFormSchema,
  generateWorkflowNodeFormSchema,
  RESOURCE_TYPES,
} from './form-schema.js';

describe('generateResourceFormSchema', () => {
  it("generates a real JSON Schema with the model resource type's own real fields", () => {
    const result = generateResourceFormSchema('models');

    expect(result.resourceType).toBe('models');
    const properties = result.jsonSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('provider');
    expect(properties).toHaveProperty('model');
    expect(properties).toHaveProperty('temperature');
  });

  it('generates a distinct schema per resource type', () => {
    const models = generateResourceFormSchema('models');
    const agents = generateResourceFormSchema('agents');

    const modelProps = Object.keys(models.jsonSchema.properties as Record<string, unknown>);
    const agentProps = Object.keys(agents.jsonSchema.properties as Record<string, unknown>);
    expect(modelProps).not.toEqual(agentProps);
    expect(agentProps).toContain('role');
    expect(agentProps).toContain('instructions');
  });
});

describe('generateAllResourceFormSchemas', () => {
  it('returns every declared resource type with a non-empty real schema', () => {
    const all = generateAllResourceFormSchemas();

    for (const resourceType of RESOURCE_TYPES) {
      expect(all[resourceType].resourceType).toBe(resourceType);
      // Not every resource type's schema is a flat `type: "object"` — tools
      // is a real `z.discriminatedUnion('type', [...])` in @agentform/schema
      // (9 tool types), which z.toJSONSchema renders as a top-level `oneOf`
      // instead. A form renderer has to handle both shapes; this assertion
      // documents that difference rather than assuming it away.
      const jsonSchema = all[resourceType].jsonSchema;
      const isFlatObject =
        jsonSchema.type === 'object' && typeof jsonSchema.properties === 'object';
      const isDiscriminatedUnion = Array.isArray(jsonSchema.oneOf) && jsonSchema.oneOf.length > 0;
      expect(isFlatObject || isDiscriminatedUnion).toBe(true);
    }
  });

  it("renders tools as a discriminated union on the real 'type' field, not a flat object", () => {
    const tools = generateResourceFormSchema('tools');

    expect(tools.jsonSchema.type).toBeUndefined();
    expect(Array.isArray(tools.jsonSchema.oneOf)).toBe(true);
    const variants = tools.jsonSchema.oneOf as Record<string, unknown>[];
    expect(variants.length).toBeGreaterThan(1);
  });
});

describe('generateWorkflowNodeFormSchema', () => {
  it('renders all 13 real workflow node types as a discriminated union', () => {
    const jsonSchema = generateWorkflowNodeFormSchema();

    expect(jsonSchema.type).toBeUndefined();
    expect(Array.isArray(jsonSchema.oneOf)).toBe(true);
    const variants = jsonSchema.oneOf as Record<string, unknown>[];
    expect(variants).toHaveLength(13);
  });

  it("includes each real node type's own distinguishing fields", () => {
    const variants = generateWorkflowNodeFormSchema().oneOf as Record<string, unknown>[];
    const byType = new Map(
      variants.map((variant) => {
        const properties = variant.properties as Record<string, Record<string, unknown>>;
        const nodeType = properties.type;
        if (nodeType === undefined) {
          throw new Error('every node variant must declare a "type" field');
        }
        return [nodeType.const as string, properties];
      }),
    );

    expect(byType.get('agent')).toHaveProperty('agent');
    expect(byType.get('tool')).toHaveProperty('tool');
    expect(byType.get('loop')).toHaveProperty('maxIterations');
    expect(byType.get('delay')).toHaveProperty('duration');
    expect(byType.get('subworkflow')).toHaveProperty('workflow');
  });
});
