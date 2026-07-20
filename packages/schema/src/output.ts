import { z } from 'zod';

export const outputSchema = z
  .object({
    value: z.string().min(1),
    description: z.string().optional(),
    sensitive: z.boolean().optional(),
  })
  .strict();

export type Output = z.infer<typeof outputSchema>;
