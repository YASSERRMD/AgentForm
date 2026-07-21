/**
 * Recursively converts every `Map` in `value` into a plain object,
 * preserving insertion order — unlike `@agentform/ir`'s internal hash
 * canonicalization (which also sorts keys, since it optimizes for stable
 * hashing rather than readability), this is for values that need to
 * become `JSON.stringify`-safe *without* losing data, while staying in
 * the order they were declared. `JSON.stringify` silently serializes a
 * `Map` as `{}` — a real, previously-undetected bug this fixes: an IR
 * resource like a workflow (`nodes`/`edges` include a `ReadonlyMap`)
 * embedded in a `PlanItem.after`, once written to a `.afplan` file via
 * plain `JSON.stringify`, would silently lose its node data even though
 * `computeContentHash` (which canonicalizes Maps correctly) had already
 * hashed the real content — causing every later `verifyPlanFile` to see
 * a tampered-looking mismatch. Applying this before anything holding a
 * `Map` is stored or serialized keeps what's hashed and what's written
 * identical.
 */
export function flattenMaps(value: unknown): unknown {
  if (value instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      result[String(key)] = flattenMaps(entry);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(flattenMaps);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = flattenMaps(entry);
    }
    return result;
  }
  return value;
}
