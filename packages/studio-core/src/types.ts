import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import type { SpecPatch } from './patch.js';

export type { AgenticApplication } from '@agentform/schema';
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
