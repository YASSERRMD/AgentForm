import { z } from 'zod';

/** The six frameworks Agentform targets in its initial release. */
export const frameworkTargetSchema = z.enum([
  'openai',
  'langgraph',
  'microsoft',
  'google-adk',
  'autogen',
  'crewai',
]);

export type FrameworkTarget = z.infer<typeof frameworkTargetSchema>;

export const runtimeSchema = z
  .object({
    target: frameworkTargetSchema,
    environment: z.string().min(1),
  })
  .strict();

export type Runtime = z.infer<typeof runtimeSchema>;
