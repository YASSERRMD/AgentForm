import { z } from 'zod';
import { durationSchema, identifierSchema } from './primitives.js';

/**
 * Fields shared by every workflow node type: an optional timeout, retry
 * policy, and an error-transition target. Graph-level requirements from
 * §6.5 (unique node identifiers, explicit entrypoint, valid transitions,
 * terminal path, error transitions actually resolving) are semantic checks
 * over the whole graph, not a single node's shape — those land with the IR
 * in Phase 4, not here.
 */
const nodeCommonShape = {
  timeout: durationSchema.optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(0).optional(),
      backoff: z.enum(['fixed', 'linear', 'exponential']).optional(),
    })
    .strict()
    .optional(),
  onError: identifierSchema.optional(),
};

const agentNodeSchema = z
  .object({ type: z.literal('agent'), agent: identifierSchema, ...nodeCommonShape })
  .strict();

const toolNodeSchema = z
  .object({ type: z.literal('tool'), tool: z.string().min(1), ...nodeCommonShape })
  .strict();

const routerNodeSchema = z
  .object({ type: z.literal('router'), default: identifierSchema.optional(), ...nodeCommonShape })
  .strict();

const parallelNodeSchema = z
  .object({
    type: z.literal('parallel'),
    branches: z.array(identifierSchema).optional(),
    ...nodeCommonShape,
  })
  .strict();

const joinNodeSchema = z
  .object({
    type: z.literal('join'),
    strategy: z.enum(['all', 'any', 'race']).optional(),
    ...nodeCommonShape,
  })
  .strict();

const loopNodeSchema = z
  .object({
    type: z.literal('loop'),
    maxIterations: z.number().int().positive(),
    condition: z.string().min(1).optional(),
    ...nodeCommonShape,
  })
  .strict();

const humanApprovalNodeSchema = z
  .object({
    type: z.literal('humanApproval'),
    approvers: z.array(z.string().min(1)).optional(),
    ...nodeCommonShape,
  })
  .strict();

const delayNodeSchema = z
  .object({ type: z.literal('delay'), duration: durationSchema, ...nodeCommonShape })
  .strict();

const eventNodeSchema = z
  .object({ type: z.literal('event'), eventType: z.string().min(1), ...nodeCommonShape })
  .strict();

const subworkflowNodeSchema = z
  .object({ type: z.literal('subworkflow'), workflow: identifierSchema, ...nodeCommonShape })
  .strict();

const transformNodeSchema = z
  .object({ type: z.literal('transform'), expression: z.string().min(1), ...nodeCommonShape })
  .strict();

const conditionNodeSchema = z
  .object({ type: z.literal('condition'), expression: z.string().min(1), ...nodeCommonShape })
  .strict();

const terminateNodeSchema = z
  .object({
    type: z.literal('terminate'),
    reason: z.string().min(1).optional(),
    ...nodeCommonShape,
  })
  .strict();

export const workflowNodeSchema = z.discriminatedUnion('type', [
  agentNodeSchema,
  toolNodeSchema,
  routerNodeSchema,
  parallelNodeSchema,
  joinNodeSchema,
  loopNodeSchema,
  humanApprovalNodeSchema,
  delayNodeSchema,
  eventNodeSchema,
  subworkflowNodeSchema,
  transformNodeSchema,
  conditionNodeSchema,
  terminateNodeSchema,
]);

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowNodeType = WorkflowNode['type'];

/**
 * `when` is a boolean expression string (e.g. `output.confidence < 0.85`).
 * Parsing it safely (no `eval`, §7) is parser-package scope from Phase 3
 * onward; here it's validated only as non-empty text.
 */
const workflowEdgeSchema = z
  .object({
    from: identifierSchema,
    to: identifierSchema,
    when: z.string().min(1).optional(),
  })
  .strict();

export const workflowSchema = z
  .object({
    entrypoint: identifierSchema,
    nodes: z
      .record(identifierSchema, workflowNodeSchema)
      .refine((nodes) => Object.keys(nodes).length > 0, {
        message: 'a workflow must declare at least one node',
      }),
    edges: z.array(workflowEdgeSchema).optional(),
  })
  .strict();

export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
