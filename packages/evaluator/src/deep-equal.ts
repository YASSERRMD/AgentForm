/**
 * Structural equality over JSON-shaped values (the only shape any
 * assertion's `equals`/tool-call-argument value can take, since both come
 * from a YAML/JSON test-case file). Deliberately not `JSON.stringify`
 * comparison — that's key-order-sensitive (`{a:1,b:2}` vs `{b:2,a:1}`
 * would compare unequal), a real footgun for a hand-authored test file
 * where property order carries no meaning.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}
