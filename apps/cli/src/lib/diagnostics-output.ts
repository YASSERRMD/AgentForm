import type { Diagnostic } from '@agentform/diagnostics';

const SEVERITY_LABEL: Record<Diagnostic['severity'], string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

function severityColor(severity: Diagnostic['severity'], color: boolean): (text: string) => string {
  if (!color) {
    return (text) => text;
  }
  const code = severity === 'error' ? '31' : severity === 'warning' ? '33' : '36';
  return (text) => `[${code}m${text}[0m`;
}

function locationSuffix(diagnostic: Diagnostic): string {
  if (diagnostic.location) {
    return ` (${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column})`;
  }
  if (diagnostic.path && diagnostic.path.length > 0) {
    return ` (at ${diagnostic.path.join('.')})`;
  }
  return '';
}

/** Human-readable, one-line-per-diagnostic rendering suitable for a terminal — the default (non-`--json`) output format for every command that surfaces diagnostics. */
export function formatDiagnosticsForHumans(
  diagnostics: readonly Diagnostic[],
  options: { color: boolean } = { color: false },
): string {
  if (diagnostics.length === 0) {
    return '';
  }

  return diagnostics
    .map((diagnostic) => {
      const colorize = severityColor(diagnostic.severity, options.color);
      const label = colorize(`${SEVERITY_LABEL[diagnostic.severity]} [${diagnostic.code}]`);
      const suggestion = diagnostic.suggestedFix
        ? `\n  Suggested fix: ${diagnostic.suggestedFix}`
        : '';
      return `${label} ${diagnostic.message}${locationSuffix(diagnostic)}${suggestion}`;
    })
    .join('\n');
}

/**
 * Stable, machine-readable shape for `--json` output — every diagnostic
 * field is included explicitly (never `JSON.stringify(diagnostic)`
 * directly) so the shape doesn't silently change if `Diagnostic` grows a
 * field later, and so consumers (IDE integrations, CI parsers) can rely
 * on it (§15.2's "Diagnostics are suitable for IDE integration").
 */
export function diagnosticToJson(diagnostic: Diagnostic): Record<string, unknown> {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    path: diagnostic.path ?? null,
    location: diagnostic.location ?? null,
    relatedLocation: diagnostic.relatedLocation ?? null,
    suggestedFix: diagnostic.suggestedFix ?? null,
  };
}
