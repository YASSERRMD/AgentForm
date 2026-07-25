import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import type { SpecPatch } from './patch.js';

export type { AgenticApplication } from '@agentform/schema';
export type {
  Agent,
  Tool,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from '@agentform/schema';
export type { Diagnostic, DiagnosticSeverity, SourceLocation } from '@agentform/diagnostics';

/**
 * The one atomic snapshot `GET /api/spec` returns: the validated
 * specification, whenever validation succeeded, plus every diagnostic
 * collected along the way (parse, schema, or semantic). `application` is
 * absent whenever an error-severity diagnostic exists — Studio never
 * displays a spec that didn't actually pass validation.
 */
export interface SpecDocumentResponse {
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

export interface HealthResponse {
  readonly status: 'ok';
  readonly rootDir: string;
}

/** Body of `POST /api/spec/patch` — a form/canvas/chat/GenAI edit, expressed as a structured patch, never a raw file write. */
export interface PatchSpecRequest {
  readonly patch: SpecPatch;
}

/**
 * `success: false` means nothing was written — `diagnostics` explains
 * why (schema/semantic/policy rejection, or a project shape this write
 * path doesn't support yet, e.g. multi-file). `success: true` always
 * carries the freshly-written `application`, re-read from disk so the
 * client's view can never drift from what's actually on it.
 */
export interface PatchSpecResponse {
  readonly success: boolean;
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

/** Body of `POST /api/genai/prompt-to-spec`. */
export interface PromptToSpecRequest {
  readonly prompt: string;
}

/**
 * Mirrors `@agentform/studio-genai`'s `SkippedResource` structurally
 * rather than importing it — studio-genai already depends on studio-core,
 * so the reverse import would be circular. Same self-contained-mirror
 * choice studio-design's http-contracts.ts makes for `Diagnostic`.
 */
export interface SkippedSpecResource {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly reason: string;
}

/**
 * `success: false` means `patch` isn't safe to accept as-is —
 * `diagnostics` explains why. `summary`/`patch`/`skipped` are still
 * populated whenever generation itself succeeded (even if the resulting
 * patch failed validation), so the UI can show what was proposed and why
 * it was rejected, not just an opaque failure. Accepting a proposal never
 * happens through this endpoint — the client re-submits `patch` to the
 * real `POST /api/spec/patch`, which re-runs this exact same validation
 * itself rather than trusting that this preview call is still fresh.
 */
export interface PromptToSpecResponse {
  readonly success: boolean;
  readonly summary?: string;
  readonly patch?: SpecPatch;
  readonly skipped?: readonly SkippedSpecResource[];
  readonly diagnostics: readonly Diagnostic[];
}
