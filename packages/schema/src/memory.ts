import { z } from 'zod';
import { dataClassificationSchema, durationSchema } from './primitives.js';

export const memoryTypeSchema = z.enum([
  'conversation',
  'session',
  'longTerm',
  'vector',
  'keyValue',
  'relational',
  'external',
]);

/**
 * Field list from §6.6: scope, retention, encryption, data classification,
 * data residency, read/write permissions, eviction, redaction, namespace
 * strategy.
 */
export const memorySchema = z
  .object({
    type: memoryTypeSchema,
    scope: z.enum(['conversation', 'session', 'agent', 'application']).optional(),
    retention: durationSchema.optional(),
    encryption: z.boolean().optional(),
    dataClassification: dataClassificationSchema.optional(),
    dataResidency: z.string().min(1).optional(),
    permissions: z.array(z.enum(['read', 'write'])).optional(),
    eviction: z.enum(['lru', 'ttl', 'manual']).optional(),
    redaction: z.array(z.string().min(1)).optional(),
    namespaceStrategy: z.string().min(1).optional(),
  })
  .strict();

export type Memory = z.infer<typeof memorySchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
