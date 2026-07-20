import { z } from 'zod';

/**
 * The example spec (§2) only exercises `datasets` + `thresholds`; the
 * richer per-test-case assertion vocabulary (§17: tool-call assertions,
 * workflow-path assertions, LLM-as-judge adapters, ...) belongs to
 * `@agentform/evaluator` starting Phase 10. This is deliberately the
 * minimal shape that already validates real specs today.
 */
export const evaluationSchema = z
  .object({
    datasets: z.array(z.string().min(1)).optional(),
    thresholds: z.record(z.string(), z.number()).optional(),
  })
  .strict();

export type Evaluation = z.infer<typeof evaluationSchema>;
