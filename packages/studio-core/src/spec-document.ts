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
 * Studio needs it (confirmed directly in Phase 15: the IR adds zero
 * content to a workflow's nodes/edges beyond `Map` re-keying), so it's
 * deliberately discarded here rather than exposed and left unused.
 *
 * Deliberately NOT re-exported from this package's main `index.ts` — it
 * pulls in `@agentform/ir`'s full barrel (`buildIR`), which transitively
 * imports `node:crypto` (`hash.ts`). `apps/studio-web` needs a browser-
 * safe way to import everything else this package exports without also
 * pulling that in; `server.ts` is the explicit, Node-only home for this
 * one function instead. See ADR-0018.
 */
export function buildSpecDocument(
  rawValue: unknown,
  options: BuildSpecDocumentOptions = {},
): SpecDocumentResponse {
  const result = buildIR(rawValue, { sourceMap: options.sourceMap });
  return { application: result.application, diagnostics: result.diagnostics };
}
