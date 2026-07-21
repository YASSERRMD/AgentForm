import { z } from 'zod';

/**
 * The assertion vocabulary spans three altitudes in the build spec (§6.8's
 * domain-model list, §17's own YAML example and 18-item prose list, and
 * Phase 10's 14-item "minimum evaluators" checklist) that don't perfectly
 * agree on naming — `type: toolCalled`/`maximumToolCalls`/`value`/
 * `workflowPath`/`equals` come directly from §17's one concrete example;
 * everything else is named to match Phase 10's own list as the literal
 * implementation checklist. `nodeNotVisited` and `fieldRange` are real
 * §17/§6.8 vocabulary ("Node not visited", "Output field range") that
 * Phase 10's 14-item list silently drops — included anyway since they're
 * natural, cheap complements to `nodeVisited`/`exactMatch` and directly
 * serve the spec's fuller intent.
 */
export const assertionSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('exactMatch'), path: z.string().min(1), equals: z.unknown() })
    .strict(),
  z
    .object({
      type: z.literal('jsonSchemaValid'),
      path: z.string().min(1).optional(),
      schema: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ type: z.literal('toolCalled'), tool: z.string().min(1) }).strict(),
  z.object({ type: z.literal('toolNotCalled'), tool: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('toolArgumentMatch'),
      tool: z.string().min(1),
      argument: z.string().min(1),
      equals: z.unknown(),
    })
    .strict(),
  z.object({ type: z.literal('workflowPath'), equals: z.array(z.string().min(1)) }).strict(),
  z.object({ type: z.literal('nodeVisited'), node: z.string().min(1) }).strict(),
  z.object({ type: z.literal('nodeNotVisited'), node: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('maximumToolCalls'),
      value: z.number().int().nonnegative(),
      tool: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal('maximumRetries'), value: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('maximumCost'), valueUsd: z.number().nonnegative() }).strict(),
  z
    .object({
      type: z.literal('maximumLatency'),
      value: z.string().regex(/^\d+(ms|s|m|h|d)$/, 'must be a duration like "30s"'),
    })
    .strict(),
  z.object({ type: z.literal('policyResult'), passed: z.boolean() }).strict(),
  z.object({ type: z.literal('approvalRequested'), node: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal('terminationReason'), equals: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('fieldRange'),
      path: z.string().min(1),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict()
    .refine((value) => value.min !== undefined || value.max !== undefined, {
      message: 'fieldRange requires at least one of min or max',
    }),
]);

export type Assertion = z.infer<typeof assertionSchema>;
export type AssertionType = Assertion['type'];
