export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/**
 * A single structured diagnostic. `path` is the field path within the
 * document (e.g. ["spec", "agents", "intake", "model"]); `location` is the
 * resolved file/line/column, when a source map is available (from Phase 3
 * onward — schema-only validation in Phase 2 has no source text to point
 * at, so `location` is commonly absent at this stage).
 */
export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly location?: SourceLocation;
  readonly relatedLocation?: SourceLocation;
  readonly suggestedFix?: string;
}
