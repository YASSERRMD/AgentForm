import type { Diagnostic } from '@agentform/diagnostics';
import { interpolateValue, type InterpolationResolver } from './interpolation.js';

/** A declared `variables.<name>` entry: `{ default: <value> }`, or `{}` for a variable with no default (required unless overridden). */
export type VariableDeclarations = Readonly<Record<string, { readonly default?: unknown }>>;
export type LocalDeclarations = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolves declared `variables:` against `overrides` (highest priority —
 * this is where a future `agentform plan --var x=y` or environment overlay
 * would feed in) falling back to each variable's own `default`. A
 * declared variable with neither is left unresolved; referencing it via
 * `${var.name}` is what actually surfaces the "missing required variable"
 * diagnostic (see `interpolation.ts`), not this step.
 */
export function resolveVariables(
  declarations: VariableDeclarations | undefined,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [name, declaration] of Object.entries(declarations ?? {})) {
    if (name in overrides) {
      resolved[name] = overrides[name];
    } else if (isRecord(declaration) && 'default' in declaration) {
      resolved[name] = declaration.default;
    }
  }
  return resolved;
}

/**
 * Resolves declared `locals:` — each local's raw value may itself contain
 * `${env.*}`/`${var.*}` interpolations, resolved here. Locals deliberately
 * cannot reference other locals (`${local.*}` is rejected within a locals
 * block), which sidesteps needing dependency ordering or cycle detection
 * for a feature the build spec only asks to support at the "compute one
 * named value from var/env" level.
 */
export function resolveLocals(
  declarations: LocalDeclarations | undefined,
  resolveEnvOrVar: InterpolationResolver,
): { resolved: Record<string, unknown>; diagnostics: Diagnostic[] } {
  const resolved: Record<string, unknown> = {};
  const diagnostics: Diagnostic[] = [];

  for (const [name, rawValue] of Object.entries(declarations ?? {})) {
    const result = interpolateValue(
      rawValue,
      (namespace, identifier) =>
        namespace === 'local' ? { found: false } : resolveEnvOrVar(namespace, identifier),
      ['locals', name],
    );
    diagnostics.push(...result.diagnostics);
    resolved[name] = result.value;
  }

  return { resolved, diagnostics };
}

export interface InterpolateDocumentOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly variableOverrides?: Readonly<Record<string, unknown>>;
}

/**
 * Top-level entry point: strips the resolution-only `variables`/`locals`
 * sections out of the document and interpolates `${env.*}`/`${var.*}`/
 * `${local.*}` throughout everything else. The returned value never
 * contains a `variables` or `locals` key — those aren't part of the
 * `AgenticApplication` schema, only inputs to this step.
 */
export function interpolateDocument(
  value: unknown,
  options: InterpolateDocumentOptions = {},
): { value: unknown; diagnostics: Diagnostic[] } {
  if (!isRecord(value)) {
    return interpolateValue(value, () => ({ found: false }));
  }

  const { variables, locals, ...rest } = value;
  const env = options.env ?? (process.env as Record<string, string>);

  const resolveEnvOrVarNamespace: InterpolationResolver = (namespace, identifier) => {
    if (namespace === 'env') {
      return identifier in env ? { found: true, value: env[identifier] } : { found: false };
    }
    // namespace === 'var' (interpolateValue never calls this resolver with 'local')
    return identifier in resolvedVariables
      ? { found: true, value: resolvedVariables[identifier] }
      : { found: false };
  };

  const resolvedVariables = resolveVariables(
    variables as VariableDeclarations | undefined,
    options.variableOverrides,
  );
  const { resolved: resolvedLocals, diagnostics: localDiagnostics } = resolveLocals(
    locals as LocalDeclarations | undefined,
    resolveEnvOrVarNamespace,
  );

  const resolver: InterpolationResolver = (namespace, identifier) => {
    if (namespace === 'local') {
      return identifier in resolvedLocals
        ? { found: true, value: resolvedLocals[identifier] }
        : { found: false };
    }
    return resolveEnvOrVarNamespace(namespace, identifier);
  };

  const { value: interpolatedRest, diagnostics: restDiagnostics } = interpolateValue(
    rest,
    resolver,
  );

  return { value: interpolatedRest, diagnostics: [...localDiagnostics, ...restDiagnostics] };
}
