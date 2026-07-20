import { z } from 'zod';
import { identifierSchema, semverSchema } from './primitives.js';

export const metadataSchema = z
  .object({
    name: identifierSchema,
    version: semverSchema,
    description: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type Metadata = z.infer<typeof metadataSchema>;
