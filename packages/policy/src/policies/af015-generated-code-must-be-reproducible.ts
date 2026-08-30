import type { PolicyDefinition } from '../types.js';

/**
 * Registered and mandatory, but not enforced by this check — deliberately,
 * and not for want of a compiler (`@agentform/compiler` and its adapters
 * have shipped since Phase 8).
 *
 * The policy engine runs over the *source* `AgenticApplication`, in
 * `validate`, `plan`, `apply`, `test`, `status`, and `drift`. Generated
 * code exists in none of those: only `agentform compile` (and `apply`'s
 * generation step) produces it, and asserting reproducibility means
 * generating the same IR twice and diffing the output — an expensive
 * whole-project operation with no artifact to inspect at the point every
 * other policy is evaluated. Wiring that in would mean running the policy
 * engine at a second, artifact-scoped stage with its own context, which is
 * a compiler-pipeline change rather than a policy implementation.
 *
 * What actually enforces the property today: the IR carries a content hash
 * that generation is a pure function of, and every adapter has its own
 * "deterministic generation: two generate() calls produce identical
 * output" test in its package. That is a build-time guarantee over the
 * generators, not a per-project runtime check — so this policy always
 * passes, and says so rather than implying a check ran.
 *
 * See ADR-0023 for why this stayed a no-op while AF014 was implemented.
 */
export const af015GeneratedCodeMustBeReproducible: PolicyDefinition = {
  id: 'AF015',
  name: 'generated-code-must-be-reproducible',
  description:
    'Reject non-deterministic code generation. Not enforced at policy-evaluation time — no generated artifact exists at that stage; each adapter enforces determinism by test instead.',
  defaultSeverity: 'error',
  mandatory: true,
  check: () => [],
};
