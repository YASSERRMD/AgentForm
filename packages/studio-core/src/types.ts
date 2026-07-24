import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';

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
