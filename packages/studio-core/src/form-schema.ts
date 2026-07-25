import {
  agentSchema,
  modelSchema,
  toolSchema,
  workflowNodeSchema,
  workflowSchema,
} from '@agentform/schema';
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

/**
 * A real JSON Schema for a single workflow node — `workflowNodeSchema` is
 * itself a `z.discriminatedUnion('type', [...])` over all 13 node types
 * (same shape as `tools`, one level deeper), so this produces a top-level
 * `oneOf` exactly like `generateResourceFormSchema('tools')` does. The
 * canvas's node editor reuses the identical variant-picker-then-ResourceForm
 * pattern `ResourceEditor` already established for `tools`, just applied
 * one level deeper (workflow -> node -> node-type variant).
 */
export function generateWorkflowNodeFormSchema(): Record<string, unknown> {
  return z.toJSONSchema(workflowNodeSchema, { target: 'draft-7', io: 'input' }) as Record<
    string,
    unknown
  >;
}
