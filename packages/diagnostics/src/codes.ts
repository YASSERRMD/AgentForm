export interface DiagnosticCodeDefinition {
  readonly code: string;
  readonly summary: string;
}

/**
 * Wraps a table of diagnostic code definitions and asserts, at module load
 * time, that no two entries share the same `code`. Callers (e.g.
 * `@agentform/schema`, `@agentform/parser`) define their own code tables
 * through this helper so a duplicate code is a load-time crash in tests,
 * not a silent collision discovered in production output.
 */
export function defineDiagnosticCodes<const T extends Record<string, DiagnosticCodeDefinition>>(
  definitions: T,
): T {
  const seen = new Map<string, string>();
  for (const [key, definition] of Object.entries(definitions)) {
    const existingKey = seen.get(definition.code);
    if (existingKey !== undefined) {
      throw new Error(
        `Duplicate diagnostic code "${definition.code}" used by both "${existingKey}" and "${key}"`,
      );
    }
    seen.set(definition.code, key);
  }
  return definitions;
}
