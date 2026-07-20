import { z } from 'zod';
import { metadataSchema } from './metadata.js';
import { runtimeSchema } from './runtime.js';
import { modelSchema } from './model.js';
import { toolSchema } from './tool.js';
import { agentSchema } from './agent.js';
import { workflowSchema } from './workflow.js';
import { memorySchema } from './memory.js';
import { evaluationSchema } from './evaluation.js';
import { observabilitySchema } from './observability.js';
import { deploymentSchema } from './deployment.js';
import { outputSchema } from './output.js';
import { identifierSchema, uniqueArray } from './primitives.js';

export const API_VERSION = 'agentform.dev/v1alpha1';
export const KIND = 'AgenticApplication';

const specSchema = z
  .object({
    runtime: runtimeSchema,
    models: z.record(identifierSchema, modelSchema),
    tools: z.record(identifierSchema, toolSchema).optional(),
    agents: z.record(identifierSchema, agentSchema),
    workflows: z.record(identifierSchema, workflowSchema),
    memory: z.record(identifierSchema, memorySchema).optional(),
    policies: uniqueArray(identifierSchema, (value) => value).optional(),
    evaluations: evaluationSchema.optional(),
    observability: observabilitySchema.optional(),
    deployment: deploymentSchema.optional(),
    outputs: z.record(identifierSchema, outputSchema).optional(),
  })
  .strict();

export const agenticApplicationSchema = z
  .object({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal(KIND),
    metadata: metadataSchema,
    spec: specSchema,
  })
  .strict();

export type AgenticApplication = z.infer<typeof agenticApplicationSchema>;
export type AgenticApplicationSpec = z.infer<typeof specSchema>;
