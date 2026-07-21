import { z } from 'zod';
import { assertionSchema } from './assertion.js';

const mockToolResultSchema = z
  .object({
    return: z.unknown().optional(),
    error: z.string().optional(),
    failCount: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    latencyMs: z.number().nonnegative().optional(),
  })
  .strict();

const scenarioToolCallSchema = z
  .object({
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const scenarioNodeOverrideSchema = z
  .object({
    next: z.string().min(1).optional(),
    toolCalls: z.array(scenarioToolCallSchema).optional(),
    approve: z.boolean().optional(),
    output: z.unknown().optional(),
  })
  .strict();

/**
 * One entry in an `evaluations.datasets` file — §17's own `tests:` YAML
 * example (`name`, `workflow`, `input`, `mocks`, `assertions`) plus
 * `nodes` (this package's own extension, not shown in that example): a
 * real test workflow with a branching node needs a way to declare which
 * edge the scenario takes, the same `ScenarioNodeOverride` shape
 * `@agentform/runtime` itself accepts.
 */
export const testCaseSchema = z
  .object({
    name: z.string().min(1),
    workflow: z.string().min(1),
    input: z.record(z.string(), z.unknown()).optional(),
    mocks: z.record(z.string(), mockToolResultSchema).optional(),
    nodes: z.record(z.string(), scenarioNodeOverrideSchema).optional(),
    maxSteps: z.number().int().positive().optional(),
    assertions: z.array(assertionSchema).min(1),
  })
  .strict();

export type TestCase = z.infer<typeof testCaseSchema>;
