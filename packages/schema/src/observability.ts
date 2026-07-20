import { z } from 'zod';

const tracingSchema = z
  .object({
    provider: z.enum(['opentelemetry', 'none']),
  })
  .strict();

export const observabilitySchema = z
  .object({
    tracing: tracingSchema.optional(),
    recordPrompts: z.boolean().optional(),
    recordToolCalls: z.boolean().optional(),
  })
  .strict();

export type Observability = z.infer<typeof observabilitySchema>;
