import type { Diagnostic } from '@agentform/studio-core';

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
}

function formatLocation(diagnostic: Diagnostic): string | undefined {
  if (!diagnostic.location) {
    return undefined;
  }
  const { file, line, column } = diagnostic.location;
  return `${file}:${line}:${column}`;
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <section aria-label="Diagnostics">
        <p>No diagnostics.</p>
      </section>
    );
  }

  return (
    <section aria-label="Diagnostics">
      <ul>
        {diagnostics.map((diagnostic, index) => {
          const location = formatLocation(diagnostic);
          return (
            <li key={`${diagnostic.code}-${index}`}>
              <span>{diagnostic.severity}</span> <code>{diagnostic.code}</code>{' '}
              <span>{diagnostic.message}</span>
              {diagnostic.path && diagnostic.path.length > 0 && (
                <span> ({diagnostic.path.join('.')})</span>
              )}
              {location && <span> [{location}]</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
