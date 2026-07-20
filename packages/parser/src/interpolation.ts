import type { Diagnostic } from '@agentform/diagnostics';
import { PARSER_DIAGNOSTIC_CODES } from './codes.js';
import type { ResourcePath } from './types.js';

export type InterpolationNamespace = 'env' | 'var' | 'local';

const NAMESPACES: readonly InterpolationNamespace[] = ['env', 'var', 'local'];

/** Matches a *candidate* interpolation span — anything between `${` and `}` — so malformed content can be diagnosed rather than left in the output untouched. */
const CANDIDATE_PATTERN = /\$\{([^}]*)\}/g;

/** Matches a *well-formed* interpolation body: `namespace.identifier`. */
const WELL_FORMED_PATTERN = /^(env|var|local)\.([A-Za-z_][A-Za-z0-9_]*)$/;

export type InterpolationResolver = (
  namespace: InterpolationNamespace,
  identifier: string,
) => { readonly found: true; readonly value: unknown } | { readonly found: false };

function diagnoseUnmatched(body: string, fullMatch: string, path: ResourcePath): Diagnostic {
  const [namespaceCandidate] = body.split('.', 1);
  if (NAMESPACES.includes(namespaceCandidate as InterpolationNamespace)) {
    return {
      code: PARSER_DIAGNOSTIC_CODES.MALFORMED_INTERPOLATION.code,
      severity: 'error',
      message: `Malformed interpolation "${fullMatch}": expected "\${${namespaceCandidate}.<identifier>}"`,
      path,
    };
  }
  return {
    code: PARSER_DIAGNOSTIC_CODES.UNKNOWN_INTERPOLATION_NAMESPACE.code,
    severity: 'error',
    message: `Unknown interpolation namespace in "${fullMatch}": expected one of ${NAMESPACES.join(', ')}`,
    path,
  };
}

function diagnoseMissing(
  namespace: InterpolationNamespace,
  identifier: string,
  path: ResourcePath,
): Diagnostic {
  return {
    code:
      namespace === 'env'
        ? PARSER_DIAGNOSTIC_CODES.UNKNOWN_ENV_VARIABLE.code
        : PARSER_DIAGNOSTIC_CODES.UNKNOWN_VARIABLE.code,
    severity: 'error',
    message: `"\${${namespace}.${identifier}}" has no value and no default`,
    path,
  };
}

/**
 * Replaces every `${namespace.identifier}` span in `text` using `resolve`,
 * without ever evaluating the expression as code (§7: "Do not use
 * JavaScript eval. Create a safe expression parser.") — the grammar is
 * intentionally just a namespace plus a dotted identifier, nothing more.
 *
 * When `text` is *exactly* one interpolation with no surrounding
 * characters (e.g. a YAML field whose entire value is `${var.maxTokens}`),
 * the resolved value's original type is preserved (so a numeric variable
 * default can still satisfy a numeric schema field). Interpolation
 * embedded in a larger string (`"prefix-${var.x}"`) always coerces to a
 * string, since there is no other sensible result type once concatenation
 * is involved.
 */
export function interpolateString(
  text: string,
  resolve: InterpolationResolver,
  path: ResourcePath,
): { value: unknown; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const matches = [...text.matchAll(CANDIDATE_PATTERN)];
  const [onlyMatch] = matches;

  if (!onlyMatch) {
    return { value: text, diagnostics };
  }

  const isWholeStringInterpolation = matches.length === 1 && onlyMatch[0] === text;

  if (isWholeStringInterpolation) {
    const fullMatch = onlyMatch[0];
    const body = onlyMatch[1] ?? '';
    const wellFormed = WELL_FORMED_PATTERN.exec(body);
    if (!wellFormed) {
      diagnostics.push(diagnoseUnmatched(body, fullMatch, path));
      return { value: text, diagnostics };
    }
    const [, namespace, identifier] = wellFormed as unknown as [
      string,
      InterpolationNamespace,
      string,
    ];
    const resolved = resolve(namespace, identifier);
    if (!resolved.found) {
      diagnostics.push(diagnoseMissing(namespace, identifier, path));
      return { value: text, diagnostics };
    }
    return { value: resolved.value, diagnostics };
  }

  const value = text.replace(CANDIDATE_PATTERN, (fullMatch, body: string) => {
    const wellFormed = WELL_FORMED_PATTERN.exec(body);
    if (!wellFormed) {
      diagnostics.push(diagnoseUnmatched(body, fullMatch, path));
      return fullMatch;
    }
    const [, namespace, identifier] = wellFormed as unknown as [
      string,
      InterpolationNamespace,
      string,
    ];
    const resolved = resolve(namespace, identifier);
    if (!resolved.found) {
      diagnostics.push(diagnoseMissing(namespace, identifier, path));
      return fullMatch;
    }
    return String(resolved.value);
  });

  return { value, diagnostics };
}

/** Recursively interpolates every string leaf in `value`, leaving non-string leaves untouched. */
export function interpolateValue(
  value: unknown,
  resolve: InterpolationResolver,
  path: ResourcePath = [],
): { value: unknown; diagnostics: Diagnostic[] } {
  if (typeof value === 'string') {
    return interpolateString(value, resolve, path);
  }

  if (Array.isArray(value)) {
    const diagnostics: Diagnostic[] = [];
    const mapped = value.map((item, index) => {
      const result = interpolateValue(item, resolve, [...path, index]);
      diagnostics.push(...result.diagnostics);
      return result.value;
    });
    return { value: mapped, diagnostics };
  }

  if (value !== null && typeof value === 'object') {
    const diagnostics: Diagnostic[] = [];
    const mapped: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const result = interpolateValue(child, resolve, [...path, key]);
      diagnostics.push(...result.diagnostics);
      mapped[key] = result.value;
    }
    return { value: mapped, diagnostics };
  }

  return { value, diagnostics: [] };
}
