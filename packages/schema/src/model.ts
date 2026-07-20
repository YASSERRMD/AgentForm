import { z } from 'zod';

const responseFormatSchema = z
  .object({
    schemaRef: z.string().min(1).optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const rateLimitsSchema = z
  .object({
    requestsPerMinute: z.number().int().positive().optional(),
    tokensPerMinute: z.number().int().positive().optional(),
  })
  .strict();

const costMetadataSchema = z
  .object({
    inputPer1MTokensUsd: z.number().nonnegative().optional(),
    outputPer1MTokensUsd: z.number().nonnegative().optional(),
  })
  .strict();

/**
 * A single field list is given in the spec (§6.2): provider, model,
 * version, endpoint, temperature, topP, maxTokens, seed, responseFormat,
 * fallbacks, rateLimits, costMetadata, capabilities, dataResidency. Not
 * every provider supports every field — that's an adapter-time
 * compatibility concern (§12), not a schema-time one, so all fields beyond
 * `provider`/`model` are optional here.
 */
export const modelSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    version: z.string().min(1).optional(),
    endpoint: z.url().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    seed: z.number().int().optional(),
    responseFormat: responseFormatSchema.optional(),
    fallbacks: z.array(z.string().min(1)).optional(),
    rateLimits: rateLimitsSchema.optional(),
    costMetadata: costMetadataSchema.optional(),
    capabilities: z.array(z.string().min(1)).optional(),
    dataResidency: z.string().min(1).optional(),
  })
  .strict();

export type Model = z.infer<typeof modelSchema>;
