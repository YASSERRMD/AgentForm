/**
 * A valid Python string literal for `value`. Generated diagnostic messages
 * often wrap a resource id in double quotes (`Tool "search-registry" is not
 * yet implemented.`) — defaulting to a single-quoted Python literal avoids
 * escaping those, mirroring Python's own `repr()` quote-preference heuristic.
 *
 * Shared across every Python-targeting adapter — see `json-schema-to-python.ts`'s
 * doc comment for why these utilities live here rather than per-adapter.
 */
export function pythonStringLiteral(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (value.includes("'") && !value.includes('"')) {
    return `"${escaped}"`;
  }
  return `'${escaped.replace(/'/g, "\\'")}'`;
}
