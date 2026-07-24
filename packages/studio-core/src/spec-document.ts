import type { SourceLocation } from '@agentform/diagnostics';
import { buildIR } from '@agentform/ir';
import type { SpecDocumentResponse } from './types.js';

export interface BuildSpecDocumentOptions {
  readonly sourceMap?: ReadonlyMap<string, SourceLocation>;
}

/**
 * Thin pure wrapper around `@agentform/ir`'s `buildIR`, narrowed to
 * exactly what Studio needs to display a spec: the validated
 * application plus its diagnostics. The compiled IR itself is Map-keyed
 * and not JSON-safe (see `@agentform/core`'s `flattenMaps`) — nothing in
 * Phase 13 needs it, so it's deliberately discarded here rather than
 * exposed and left unused; Phase 15's canvas is what will need it.
 */
export function buildSpecDocument(
  rawValue: unknown,
  options: BuildSpecDocumentOptions = {},
): SpecDocumentResponse {
  const result = buildIR(rawValue, { sourceMap: options.sourceMap });
  return { application: result.application, diagnostics: result.diagnostics };
}
