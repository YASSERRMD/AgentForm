import { z } from 'zod';
import { agentSchema } from './agent.js';
import { evaluationSchema } from './evaluation.js';
import { memorySchema } from './memory.js';
import { metadataSchema } from './metadata.js';
import { modelSchema } from './model.js';
import { identifierSchema, semverSchema, uniqueArray } from './primitives.js';
import { toolSchema } from './tool.js';
import { workflowSchema } from './workflow.js';

/**
 * A project's reference to an external module (§Phase 12 "module
 * concept"): `spec.modules.<id>: { source, version, inputs? }`. Resolving
 * `source`+`version` against a registry (`@agentform/registry`) is
 * deliberately not this schema's concern — schema validation only checks
 * the *reference* is well-formed, the same separation every other
 * `$ref`-like mechanism in this codebase already uses (parsing/resolution
 * is a `@agentform/parser`-and-later concern, never schema-time).
 */
export const moduleReferenceSchema = z
  .object({
    source: z.string().min(1),
    version: semverSchema,
    /** Values for the module's own declared `spec.inputs` — §Phase 12 "module inputs and outputs must be explicit": every key here must match one the module actually declares, checked at resolution time (a schema alone can't know what a not-yet-fetched module declares). */
    inputs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ModuleReference = z.infer<typeof moduleReferenceSchema>;

export const moduleInputSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string().optional(),
    default: z.unknown().optional(),
  })
  .strict();

export type ModuleInput = z.infer<typeof moduleInputSchema>;

/** `value` is a `${...}`-style reference into the module's own resolved resources (e.g. `${agents.intake.model}`) — kept as an opaque string, the same way a workflow edge's `when` expression is (§7's "no real expression evaluator" precedent, ADR-0009/0011). */
export const moduleOutputSchema = z
  .object({
    description: z.string().optional(),
    value: z.string().min(1),
  })
  .strict();

export type ModuleOutput = z.infer<typeof moduleOutputSchema>;

export const MODULE_API_VERSION = 'agentform.dev/v1alpha1';
export const MODULE_KIND = 'AgentformModule';

const moduleSpecSchema = z
  .object({
    inputs: z.record(identifierSchema, moduleInputSchema).optional(),
    outputs: z.record(identifierSchema, moduleOutputSchema).optional(),
    models: z.record(identifierSchema, modelSchema).optional(),
    tools: z.record(identifierSchema, toolSchema).optional(),
    agents: z.record(identifierSchema, agentSchema).optional(),
    workflows: z.record(identifierSchema, workflowSchema).optional(),
    memory: z.record(identifierSchema, memorySchema).optional(),
    policies: uniqueArray(identifierSchema, (value) => value).optional(),
    evaluations: evaluationSchema.optional(),
  })
  .strict();

/**
 * A published module's own document shape (§Phase 12 "a module may
 * contain: agents, tools, workflows, policies, evaluations, prompts,
 * schemas"). "Prompts" and "schemas" aren't separate top-level
 * collections here — a prompt is an agent's `instructions`, and a schema
 * is a tool's `inputSchema`/`outputSchema` or an agent's `inputSchema`/
 * `outputSchema` — both already exist inside `agentSchema`/`toolSchema`,
 * so a module built from those two collections already carries both;
 * inventing separate `prompts:`/`schemas:` collections would just be two
 * more places the same content could live, not new capability.
 */
export const moduleDefinitionSchema = z
  .object({
    apiVersion: z.literal(MODULE_API_VERSION),
    kind: z.literal(MODULE_KIND),
    metadata: metadataSchema,
    spec: moduleSpecSchema,
  })
  .strict();

export type ModuleDefinition = z.infer<typeof moduleDefinitionSchema>;
export type ModuleDefinitionSpec = z.infer<typeof moduleSpecSchema>;
