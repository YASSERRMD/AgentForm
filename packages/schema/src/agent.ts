import { z } from 'zod';
import { durationSchema, identifierSchema, uniqueArray } from './primitives.js';

const instructionsSchema = z.union([
  z.object({ file: z.string().min(1) }).strict(),
  z.object({ text: z.string().min(1) }).strict(),
]);

const limitsSchema = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    timeout: durationSchema.optional(),
    maxCostUsd: z.number().nonnegative().optional(),
  })
  .strict();

const retrySchema = z
  .object({
    maxAttempts: z.number().int().min(0).optional(),
    backoff: z.enum(['fixed', 'linear', 'exponential']).optional(),
  })
  .strict();

const delegationSchema = z
  .object({
    allowedAgents: z.array(identifierSchema).optional(),
    strategy: z.enum(['manual', 'automatic']).optional(),
  })
  .strict();

const memoryRefSchema = z
  .object({
    ref: identifierSchema,
  })
  .strict();

/**
 * Field list from §6.3: role, description, model, instructions,
 * inputSchema, outputSchema, tools, memory, delegation, limits, retry,
 * guardrails, policies, metadata.
 */
export const agentSchema = z
  .object({
    model: identifierSchema,
    role: z.string().min(1),
    description: z.string().optional(),
    instructions: instructionsSchema,
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    tools: uniqueArray(identifierSchema, (value) => value).optional(),
    memory: memoryRefSchema.optional(),
    delegation: delegationSchema.optional(),
    limits: limitsSchema.optional(),
    retry: retrySchema.optional(),
    guardrails: z.array(z.string().min(1)).optional(),
    policies: uniqueArray(identifierSchema, (value) => value).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type Agent = z.infer<typeof agentSchema>;
