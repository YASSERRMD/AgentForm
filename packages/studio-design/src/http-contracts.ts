import { z } from 'zod';
import type {
  CanvasPosition,
  ChangeProvenance,
  ChatDesignRequest,
  ChatDesignResponse,
  ChatHistoryMessage,
  DesignArtifact,
  DesignDraft,
  FormLayout,
  GetDesignResponse,
  LayoutNode,
  PromptToDesignRequest,
  PromptToDesignResponse,
  PutDesignRequest,
  PutDesignResponse,
  ResourceBinding,
  StyleTokens,
} from './types.js';

const sourceLocationSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
});

// Mirrors `Diagnostic` (`@agentform/diagnostics`) — kept self-contained
// rather than importing studio-core's copy, matching studio-core's own
// pattern of never depending on a sibling Studio package for a type this
// cheap to mirror directly.
const diagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  location: sourceLocationSchema.optional(),
  relatedLocation: sourceLocationSchema.optional(),
  suggestedFix: z.string().optional(),
});

export const resourceBindingSchema = z.object({
  resourceType: z.enum(['agents', 'workflows']),
  resourceId: z.string().min(1),
}) satisfies z.ZodType<ResourceBinding>;

const layoutWidgetSchema = z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'date']);

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(['container', 'field']),
    label: z.string().optional(),
    fieldPath: z.string().optional(),
    widget: layoutWidgetSchema.optional(),
    children: z.array(layoutNodeSchema).optional(),
  }),
);

export const formLayoutSchema = z.object({
  input: z.array(layoutNodeSchema).optional(),
  output: z.array(layoutNodeSchema).optional(),
}) satisfies z.ZodType<FormLayout>;

export const canvasPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
}) satisfies z.ZodType<CanvasPosition>;

export const styleTokensSchema = z.object({
  spacing: z.record(z.string(), z.string()).optional(),
  color: z.record(z.string(), z.string()).optional(),
  typography: z.record(z.string(), z.string()).optional(),
}) satisfies z.ZodType<StyleTokens>;

export const designArtifactSchema = z.object({
  binding: resourceBindingSchema,
  designVersion: z.string(),
  specVersionTarget: z.string(),
  contentHash: z.string(),
  layout: formLayoutSchema.optional(),
  positions: z.record(z.string(), canvasPositionSchema).optional(),
  styleTokens: styleTokensSchema.optional(),
}) satisfies z.ZodType<DesignArtifact>;

export const designDraftSchema = z.object({
  binding: resourceBindingSchema,
  layout: formLayoutSchema.optional(),
  positions: z.record(z.string(), canvasPositionSchema).optional(),
  styleTokens: styleTokensSchema.optional(),
}) satisfies z.ZodType<DesignDraft>;

export const getDesignResponseSchema = z.object({
  design: designArtifactSchema.nullable(),
}) satisfies z.ZodType<GetDesignResponse>;

export const changeProvenanceSchema = z.object({
  source: z.enum(['manual', 'genai', 'chat']),
  summary: z.string().optional(),
}) satisfies z.ZodType<ChangeProvenance>;

export const putDesignRequestSchema = z.object({
  design: designDraftSchema,
  provenance: changeProvenanceSchema.optional(),
}) satisfies z.ZodType<PutDesignRequest>;

export const putDesignResponseSchema = z.object({
  success: z.boolean(),
  design: designArtifactSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<PutDesignResponse>;

export const promptToDesignRequestSchema = z.object({
  agentId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
}) satisfies z.ZodType<PromptToDesignRequest>;

export const promptToDesignResponseSchema = z.object({
  success: z.boolean(),
  design: designArtifactSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<PromptToDesignResponse>;

const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
}) satisfies z.ZodType<ChatHistoryMessage>;

export const chatDesignRequestSchema = z.object({
  agentId: z.string().min(1),
  message: z.string().min(1).max(4000),
  history: z.array(chatHistoryMessageSchema).max(50).optional(),
}) satisfies z.ZodType<ChatDesignRequest>;

export const chatDesignResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  design: designArtifactSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
}) satisfies z.ZodType<ChatDesignResponse>;
