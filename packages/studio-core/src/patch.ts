export type SpecPatchOperationType = 'add' | 'replace' | 'remove';

export interface SpecPatchOperation {
  readonly op: SpecPatchOperationType;
  readonly path: readonly (string | number)[];
  readonly value?: unknown;
}

export type SpecPatch = readonly SpecPatchOperation[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function setIn(value: unknown, path: readonly (string | number)[], newValue: unknown): unknown {
  const key = path[0];
  if (key === undefined) {
    return newValue;
  }
  const rest = path.slice(1);
  if (typeof key === 'number') {
    const array = Array.isArray(value) ? [...value] : [];
    array[key] = setIn(array[key], rest, newValue);
    return array;
  }
  const record = isRecord(value) ? { ...value } : {};
  record[key] = setIn(record[key], rest, newValue);
  return record;
}

function removeIn(value: unknown, path: readonly (string | number)[]): unknown {
  const key = path[0];
  if (key === undefined) {
    return value;
  }
  const rest = path.slice(1);
  if (rest.length > 0) {
    if (typeof key === 'number' && Array.isArray(value)) {
      const array = [...value];
      array[key] = removeIn(array[key], rest);
      return array;
    }
    if (typeof key === 'string' && isRecord(value)) {
      return { ...value, [key]: removeIn(value[key], rest) };
    }
    return value;
  }
  if (typeof key === 'number' && Array.isArray(value)) {
    const array = [...value];
    array.splice(key, 1);
    return array;
  }
  if (typeof key === 'string' && isRecord(value)) {
    const remainder = { ...value };
    delete remainder[key];
    return remainder;
  }
  return value;
}

/**
 * Applies a `SpecPatch` and returns a new, structurally independent
 * document — the input is never mutated. Every mutation Studio makes
 * (form, canvas, chat, GenAI) is expressed as one of these patches
 * before it re-enters the schema/semantic/policy pipeline. An empty
 * patch is the identity operation, by construction: the loop below
 * never runs, so the original reference is returned unchanged — the
 * lossless round trip Phase 13 requires.
 *
 * Generic (not `AgenticApplication`-specific): studio-web applies
 * patches to an already-validated document for optimistic local
 * preview, but studio-server's write path (Phase 14) applies the same
 * patch to the raw, not-yet-validated value it just read from disk,
 * *before* deciding whether the result is even valid — the function
 * itself is purely structural and has no opinion on that.
 */
export function applyPatch<T>(document: T, patch: SpecPatch): T {
  let result: unknown = document;
  for (const operation of patch) {
    result =
      operation.op === 'remove'
        ? removeIn(result, operation.path)
        : setIn(result, operation.path, operation.value);
  }
  return result as T;
}
