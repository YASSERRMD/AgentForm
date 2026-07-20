import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (value instanceof Map) {
    return canonicalize(Object.fromEntries(value));
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const canonicalObject: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      canonicalObject[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return canonicalObject;
  }

  return value;
}

/**
 * A JSON serialization of `value` with every object's keys sorted and
 * every `Map` converted to a sorted-key object, recursively — so two
 * values that differ only in source-formatting artifacts (key insertion
 * order, Map iteration order) serialize identically. This is what makes
 * `computeContentHash` stable across equivalent source formatting (§3.6,
 * §8) rather than accidentally sensitive to it.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** `sha256:<hex>` over the canonical serialization of `value`. */
export function computeContentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalStringify(value)).digest('hex')}`;
}
