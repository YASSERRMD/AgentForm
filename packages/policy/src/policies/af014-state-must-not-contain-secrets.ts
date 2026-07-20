import type { PolicyDefinition } from '../types.js';

/**
 * Forward-looking placeholder: Agentform's state engine (persisted current
 * state of an applied application) does not exist until Phase 7, so
 * `PolicyContext` — which only carries the source `AgenticApplication` —
 * has no state to inspect yet. This policy is registered now (mandatory,
 * so it cannot later be silently disabled by an already-committed
 * override config) and always passes until Phase 7 adds a state snapshot
 * to check against `SECRET_PATTERNS` (mirroring AF001).
 */
export const af014StateMustNotContainSecrets: PolicyDefinition = {
  id: 'AF014',
  name: 'state-must-not-contain-secrets',
  description:
    'Reject persisted state that contains an inline secret. Always passes until Phase 7 adds a state engine to check.',
  defaultSeverity: 'error',
  mandatory: true,
  check: () => [],
};
