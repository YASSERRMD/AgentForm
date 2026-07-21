import { flattenMaps } from '@agentform/core';

/**
 * Recursively converts every `Map` in `value` into a plain object,
 * preserving insertion order (unlike `@agentform/ir`'s `canonicalStringify`,
 * which sorts keys for stable hashing — presentation output should reflect
 * the order resources were declared in, not a canonical hash ordering).
 * Used to make `AgentformIR` values `JSON.stringify`-able and
 * `yaml.stringify`-able for `inspect`/`graph` output.
 */
export function toPlainObject(value: unknown): unknown {
  return flattenMaps(value);
}
