/**
 * Node-only subpath (`@agentform/studio-design/server`). `computeContentHash`
 * imports `node:crypto` transitively via `@agentform/ir`'s main barrel, so
 * this file — and everything it imports — must never be reachable from
 * `./index.ts`. This split is made up front, before any browser crash
 * forces it, applying the exact lesson ADR-0018 recorded the hard way
 * during Phase 15 (three separate barrel-mixing bugs, each only found by
 * loading a real browser). See ADR-0019.
 *
 * Only `apps/studio-server` imports from here — hashing happens once, at
 * write time, so `specVersionTarget` and `contentHash` are always computed
 * with the exact same algorithm and never trusted from a client submission.
 */
import { computeContentHash } from '@agentform/ir';
import type { AgenticApplication } from '@agentform/schema';
import { CURRENT_DESIGN_VERSION } from './types.js';
import type { DesignArtifact, DesignDraft } from './types.js';

export function computeDesignContentHash(fields: Omit<DesignArtifact, 'contentHash'>): string {
  return computeContentHash(fields);
}

export function stampDesignArtifact(
  draft: DesignDraft,
  application: AgenticApplication,
): DesignArtifact {
  const withoutHash: Omit<DesignArtifact, 'contentHash'> = {
    binding: draft.binding,
    designVersion: CURRENT_DESIGN_VERSION,
    specVersionTarget: computeContentHash(application),
    layout: draft.layout,
    positions: draft.positions,
    styleTokens: draft.styleTokens,
  };
  return { ...withoutHash, contentHash: computeDesignContentHash(withoutHash) };
}
