import type { PolicyDefinition } from '../types.js';

/**
 * Forward-looking placeholder: the compiler that turns an
 * `AgenticApplication` into generated framework code does not exist until
 * Phase 8, so there is no generated-code artifact for `PolicyContext` (the
 * source document only) to check reproducibility against yet. Registered
 * now as mandatory so it cannot later be silently disabled by an
 * already-committed override config; always passes until Phase 8 gives it
 * something real to compare (e.g. two compiles of the same IR content hash
 * producing byte-identical output).
 */
export const af015GeneratedCodeMustBeReproducible: PolicyDefinition = {
  id: 'AF015',
  name: 'generated-code-must-be-reproducible',
  description:
    'Reject non-deterministic code generation. Always passes until Phase 8 adds a compiler to check.',
  defaultSeverity: 'error',
  mandatory: true,
  check: () => [],
};
