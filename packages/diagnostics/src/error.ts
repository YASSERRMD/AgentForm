import type { Diagnostic } from './types.js';

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const where = diagnostic.location
    ? ` (${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column})`
    : diagnostic.path && diagnostic.path.length > 0
      ? ` (at ${diagnostic.path.join('.')})`
      : '';
  return `[${diagnostic.code}] ${diagnostic.severity}: ${diagnostic.message}${where}`;
}

/**
 * Thrown by validation/compilation stages that must fail atomically with
 * every collected diagnostic attached, rather than surfacing only the
 * first problem found.
 */
export class DiagnosticError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    super(
      diagnostics.length > 0
        ? diagnostics.map(formatDiagnostic).join('\n')
        : 'Diagnostic error with no diagnostics',
    );
    this.name = 'DiagnosticError';
    this.diagnostics = diagnostics;
  }
}
