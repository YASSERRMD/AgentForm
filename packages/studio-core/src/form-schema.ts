import { agentSchema, modelSchema, toolSchema, workflowSchema } from '@agentform/schema';
import { z } from 'zod';

export type ResourceType = 'models' | 'tools' | 'agents' | 'workflows';

export const RESOURCE_TYPES: readonly ResourceType[] = ['models', 'tools', 'agents', 'workflows'];

const RESOURCE_SCHEMAS: Record<ResourceType, z.ZodType> = {
  models: modelSchema,
  tools: toolSchema,
  agents: agentSchema,
  workflows: workflowSchema,
};

export interface ResourceFormSchema {
  readonly resourceType: ResourceType;
  readonly jsonSchema: Record<string, unknown>;
}

/**
 * A real JSON Schema for a single resource type, generated directly from
 * its own Zod schema — the exact same schema @agentform/schema validates
 * against, so a form built from this can never drift from what the
 * server will actually accept. Deliberately per-resource-type, not the
 * whole-document schema `@agentform/schema`'s `generateJsonSchema()`
 * produces — a form edits one resource at a time.
 */
export function generateResourceFormSchema(resourceType: ResourceType): ResourceFormSchema {
  const schema = RESOURCE_SCHEMAS[resourceType];
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<
    string,
    unknown
  >;
  return { resourceType, jsonSchema };
}

export function generateAllResourceFormSchemas(): Record<ResourceType, ResourceFormSchema> {
  const entries = RESOURCE_TYPES.map(
    (resourceType) => [resourceType, generateResourceFormSchema(resourceType)] as const,
  );
  return Object.fromEntries(entries) as Record<ResourceType, ResourceFormSchema>;
}
