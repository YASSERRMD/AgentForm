/**
 * Reads a dot-separated path (`"result.confidence"`) out of a value —
 * deliberately not a JSONPath/expression engine (Agentform has none, by
 * design — see `@agentform/runtime`'s `ScenarioNodeOverride` doc comment
 * for why). Returns `undefined` for a missing segment or a non-object
 * intermediate value rather than throwing, so a `fieldRange`/`exactMatch`
 * assertion against an absent field fails the assertion cleanly instead
 * of crashing the whole test run.
 */
export function getByPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
