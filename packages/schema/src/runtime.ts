import { z } from 'zod';

/** The frameworks Agentform can compile a specification into. Six shipped in the initial release; 'agno' followed post-v1. */
export const frameworkTargetSchema = z.enum([
  'openai',
  'langgraph',
  'microsoft',
  'google-adk',
  'autogen',
  'crewai',
  'agno',
]);

export type FrameworkTarget = z.infer<typeof frameworkTargetSchema>;

export const runtimeSchema = z
  .object({
    target: frameworkTargetSchema,
    environment: z.string().min(1),
  })
  .strict();

export type Runtime = z.infer<typeof runtimeSchema>;
