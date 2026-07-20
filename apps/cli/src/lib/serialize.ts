/**
 * Recursively converts every `Map` in `value` into a plain object,
 * preserving insertion order (unlike `@agentform/ir`'s `canonicalStringify`,
 * which sorts keys for stable hashing — presentation output should reflect
 * the order resources were declared in, not a canonical hash ordering).
 * Used to make `AgentformIR` values `JSON.stringify`-able and
 * `yaml.stringify`-able for `inspect`/`graph` output.
 */
export function toPlainObject(value: unknown): unknown {
  if (value instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      result[String(key)] = toPlainObject(entry);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(toPlainObject);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toPlainObject(entry);
    }
    return result;
  }
  return value;
}
