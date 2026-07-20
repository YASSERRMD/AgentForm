export interface WalkedString {
  readonly value: string;
  readonly path: readonly (string | number)[];
}

/**
 * Recursively collects every string value reachable from `value`, tagged
 * with its field path (e.g. `["spec", "agents", "assistant", "instructions", "text"]`).
 * Used by policies that need to scan the *whole* application for a pattern
 * regardless of which field it turns up in (AF001 inline secrets today;
 * any future "must not appear anywhere" check can reuse it).
 */
export function walkStrings(
  value: unknown,
  path: readonly (string | number)[] = [],
): readonly WalkedString[] {
  if (typeof value === 'string') {
    return [{ value, path }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => walkStrings(item, [...path, index]));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      walkStrings(child, [...path, key]),
    );
  }
  return [];
}

/** Joins a field path into the dotted `resourceAddress` shape used by `PolicyFinding`. */
export function pathToAddress(path: readonly (string | number)[]): string {
  return path.join('.');
}
