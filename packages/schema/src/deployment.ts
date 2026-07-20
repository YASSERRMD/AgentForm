import { z } from 'zod';

/**
 * §6.9 explicitly says not to implement every cloud deployment target in
 * the initial phases and to design the interface first — so `config` stays
 * an open record rather than a per-target discriminated union until a
 * concrete deployment provider actually needs its own validated shape.
 */
export const deploymentSchema = z
  .object({
    type: z.enum(['local', 'docker', 'kubernetes', 'serverless', 'frameworkNative', 'custom']),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Deployment = z.infer<typeof deploymentSchema>;
