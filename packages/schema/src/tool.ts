import { z } from 'zod';
import { dataClassificationSchema, durationSchema, sideEffectSchema } from './primitives.js';

/**
 * Fields shared by every tool type (§6.4): input/output schema, permissions,
 * timeout, retries, idempotency, side-effect classification, an auth
 * reference, network destination, data classification, and audit
 * requirements. Kept as a plain shape object (not `.extend()`) so each
 * discriminated-union member below can spread it directly.
 */
const toolCommonShape = {
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  timeout: durationSchema.optional(),
  retries: z.number().int().min(0).optional(),
  idempotent: z.boolean().optional(),
  idempotencyStrategy: z.string().min(1).optional(),
  sideEffect: sideEffectSchema.optional(),
  authRef: z.string().min(1).optional(),
  networkDestination: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  dataClassification: dataClassificationSchema.optional(),
  auditRequired: z.boolean().optional(),
};

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const httpOperationSchema = z
  .object({
    method: httpMethodSchema,
    path: z.string().min(1),
  })
  .strict();

const mcpToolSchema = z
  .object({
    type: z.literal('mcp'),
    server: z.string().min(1),
    operation: z.string().min(1),
    ...toolCommonShape,
  })
  .strict();

const httpToolSchema = z
  .object({
    type: z.literal('http'),
    baseUrl: z.string().min(1),
    operations: z.record(z.string(), httpOperationSchema),
    ...toolCommonShape,
  })
  .strict();

const openapiToolSchema = z
  .object({
    type: z.literal('openapi'),
    specPath: z.string().min(1),
    baseUrl: z.string().min(1).optional(),
    ...toolCommonShape,
  })
  .strict();

const functionToolSchema = z
  .object({
    type: z.literal('function'),
    handler: z.string().min(1),
    ...toolCommonShape,
  })
  .strict();

const databaseToolSchema = z
  .object({
    type: z.literal('database'),
    connectionRef: z.string().min(1),
    operations: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    ...toolCommonShape,
  })
  .strict();

const queueToolSchema = z
  .object({
    type: z.literal('queue'),
    queueRef: z.string().min(1),
    ...toolCommonShape,
  })
  .strict();

const agentToolSchema = z
  .object({
    type: z.literal('agent'),
    agent: z.string().min(1),
    ...toolCommonShape,
  })
  .strict();

const humanApprovalToolSchema = z
  .object({
    type: z.literal('humanApproval'),
    approvers: z.array(z.string().min(1)).optional(),
    ...toolCommonShape,
  })
  .strict();

const customPluginToolSchema = z
  .object({
    type: z.literal('customPlugin'),
    plugin: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
    ...toolCommonShape,
  })
  .strict();

export const toolSchema = z.discriminatedUnion('type', [
  mcpToolSchema,
  httpToolSchema,
  openapiToolSchema,
  functionToolSchema,
  databaseToolSchema,
  queueToolSchema,
  agentToolSchema,
  humanApprovalToolSchema,
  customPluginToolSchema,
]);

export type Tool = z.infer<typeof toolSchema>;
export type ToolType = Tool['type'];
