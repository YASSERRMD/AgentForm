import { agenticApplicationSchema } from '@agentform/schema';
import { z } from 'zod';
import type { ResourceFormSchema, ResourceType } from './form-schema.js';
import { RESOURCE_TYPES } from './form-schema.js';
import type { SpecPatchOperation } from './patch.js';
import type {
  AuditChainVerification,
  AuditEntry,
  AuditListResponse,
  AuditTarget,
  ChangeProvenance,
  ChatHistoryMessage,
  ChatSpecRequest,
  ChatSpecResponse,
  Diagnostic,
  HealthResponse,
  PatchSpecRequest,
  PatchSpecResponse,
  PromptToSpecRequest,
  PromptToSpecResponse,
  SkippedSpecResource,
  SpecDocumentResponse,
} from './types.js';

const sourceLocationSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
});

// Hand-written to mirror `Diagnostic` (`@agentform/diagnostics`) field
// for field. `satisfies` (not `: z.ZodType<Diagnostic>`) so the schema
// keeps its precise inferred type for `.parse()` callers while still
// being checked for assignability against the real interface — any
// future field added to `Diagnostic` and not mirrored here becomes a
// compile error at this line, not a silent runtime gap.
export const diagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  location: sourceLocationSchema.optional(),
  relatedLocation: sourceLocationSchema.optional(),
  suggestedFix: z.string().optional(),
}) satisfies z.ZodType<Diagnostic>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  rootDir: z.string(),
}) satisfies z.ZodType<HealthResponse>;

// `application` reuses the real `agenticApplicationSchema` directly
// (not a hand-written mirror) — it's the single validation schema
// already used everywhere else, so the HTTP contract can never drift
// from what actually gets validated.
export const specDocumentResponseSchema = z.object({
  application: agenticApplicationSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<SpecDocumentResponse>;

// The request body's own shape needs real validation too — this is the
// first endpoint that accepts client-submitted content, not just serves
// it, so a malformed `path`/`op` must be rejected as a 400 before it
// ever reaches `applyPatch`, not surface as an obscure runtime error.
export const specPatchOperationSchema = z.object({
  op: z.enum(['add', 'replace', 'remove']),
  path: z.array(z.union([z.string(), z.number()])).min(1),
  value: z.unknown().optional(),
}) satisfies z.ZodType<SpecPatchOperation>;

export const changeProvenanceSchema = z.object({
  source: z.enum(['manual', 'genai', 'chat']),
  summary: z.string().optional(),
}) satisfies z.ZodType<ChangeProvenance>;

export const patchSpecRequestSchema = z.object({
  patch: z.array(specPatchOperationSchema),
  provenance: changeProvenanceSchema.optional(),
}) satisfies z.ZodType<PatchSpecRequest>;

export const patchSpecResponseSchema = z.object({
  success: z.boolean(),
  application: agenticApplicationSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<PatchSpecResponse>;

export const promptToSpecRequestSchema = z.object({
  prompt: z.string().min(1),
}) satisfies z.ZodType<PromptToSpecRequest>;

const skippedSpecResourceSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string(),
  reason: z.string(),
}) satisfies z.ZodType<SkippedSpecResource>;

export const promptToSpecResponseSchema = z.object({
  success: z.boolean(),
  summary: z.string().optional(),
  patch: z.array(specPatchOperationSchema).optional(),
  skipped: z.array(skippedSpecResourceSchema).optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<PromptToSpecResponse>;

export const resourceFormSchemaSchema = z.object({
  resourceType: z.enum(RESOURCE_TYPES as [ResourceType, ...ResourceType[]]),
  jsonSchema: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<ResourceFormSchema>;

export const formSchemasResponseSchema = z.object({
  models: resourceFormSchemaSchema,
  tools: resourceFormSchemaSchema,
  agents: resourceFormSchemaSchema,
  workflows: resourceFormSchemaSchema,
});

const auditTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spec') }),
  z.object({ kind: z.literal('design'), resourceType: z.string(), resourceId: z.string() }),
]) satisfies z.ZodType<AuditTarget>;

export const auditEntrySchema = z.object({
  timestamp: z.string(),
  source: z.enum(['manual', 'genai', 'chat']),
  summary: z.string(),
  target: auditTargetSchema,
  previousEntryHash: z.string(),
  entryHash: z.string(),
}) satisfies z.ZodType<AuditEntry>;

export const auditChainVerificationSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  verifiedEntryCount: z.number(),
  totalEntryCount: z.number(),
}) satisfies z.ZodType<AuditChainVerification>;

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  verification: auditChainVerificationSchema,
}) satisfies z.ZodType<AuditListResponse>;

const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
}) satisfies z.ZodType<ChatHistoryMessage>;

export const chatSpecRequestSchema = z.object({
  message: z.string().min(1),
  history: z.array(chatHistoryMessageSchema).optional(),
}) satisfies z.ZodType<ChatSpecRequest>;

export const chatSpecResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  patch: z.array(specPatchOperationSchema).optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<ChatSpecResponse>;
