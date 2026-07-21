/**
 * Substitutes `${input.<name>}` inside a module's own resource
 * definitions — a small, self-contained interpolator scoped to exactly
 * one namespace, deliberately not built on `@agentform/parser`'s
 * `interpolateValue` (whose `env`/`var`/`local` namespace set is fixed
 * and already relied on by every existing project document; extending
 * it with a fourth `input` namespace would risk that well-tested
 * behavior for a need that's actually quite different in scope — a
 * module's inputs are resolved once, by the registry, before its
 * content is merged into a project, not as part of the general
 * project-document interpolation pass). Whole-string interpolation
 * (`"${input.x}"` as the entire field value) preserves the input's
 * original type, matching `@agentform/parser`'s own convention for
 * `${var.x}` — an object/number/boolean default should survive
 * unstringified when it's the field's only content.
 */

const CANDIDATE_PATTERN = /\$\{input\.([A-Za-z_][A-Za-z0-9_]*)\}/g;

export interface InputSubstitutionResult {
  readonly value: unknown;
  /** Input names referenced (via `${input.<name>}`) that had no supplied or default value — the caller should report these, not silently leave the placeholder text in place. */
  readonly missing: readonly string[];
}

function substituteString(
  text: string,
  inputs: Readonly<Record<string, unknown>>,
): InputSubstitutionResult {
  const matches = [...text.matchAll(CANDIDATE_PATTERN)];
  if (matches.length === 0) {
    return { value: text, missing: [] };
  }

  const missing: string[] = [];
  const isWholeStringSubstitution = matches.length === 1 && matches[0]![0] === text;

  if (isWholeStringSubstitution) {
    const name = matches[0]![1]!;
    if (!(name in inputs)) {
      return { value: text, missing: [name] };
    }
    return { value: inputs[name], missing: [] };
  }

  const value = text.replace(CANDIDATE_PATTERN, (fullMatch, name: string) => {
    if (!(name in inputs)) {
      missing.push(name);
      return fullMatch;
    }
    return String(inputs[name]);
  });

  return { value, missing };
}

/** Recursively substitutes `${input.<name>}` in every string leaf of `value`, leaving non-string leaves untouched. */
export function substituteInputs(
  value: unknown,
  inputs: Readonly<Record<string, unknown>>,
): InputSubstitutionResult {
  if (typeof value === 'string') {
    return substituteString(value, inputs);
  }

  if (Array.isArray(value)) {
    const missing: string[] = [];
    const mapped = value.map((item) => {
      const result = substituteInputs(item, inputs);
      missing.push(...result.missing);
      return result.value;
    });
    return { value: mapped, missing };
  }

  if (value !== null && typeof value === 'object') {
    const missing: string[] = [];
    const mapped: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const result = substituteInputs(child, inputs);
      missing.push(...result.missing);
      mapped[key] = result.value;
    }
    return { value: mapped, missing };
  }

  return { value, missing: [] };
}
