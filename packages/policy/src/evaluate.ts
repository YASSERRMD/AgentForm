import type { Diagnostic } from '@agentform/diagnostics';
import { POLICY_ENGINE_DIAGNOSTIC_CODES } from './codes.js';
import type {
  PolicyContext,
  PolicyDefinition,
  PolicyEngineConfig,
  PolicyResult,
  PolicySeverity,
} from './types.js';

const SEVERITY_RANK: Record<PolicySeverity | 'skip', number> = {
  error: 2,
  warning: 1,
  skip: 0,
};

function isDowngrade(from: PolicySeverity, to: PolicySeverity | 'skip'): boolean {
  return SEVERITY_RANK[to] < SEVERITY_RANK[from];
}

export interface EvaluatePoliciesResult {
  readonly results: readonly PolicyResult[];
  /** Problems with the override *configuration itself* — a rejected mandatory override, a missing justification, an override for an unknown policy ID. Never contains policy pass/warn/fail outcomes; those live in `results`. */
  readonly diagnostics: readonly Diagnostic[];
}

/** True if any policy resolved to `status: 'fail'` — the signal callers (e.g. the CLI's `validate`/`apply` pipeline) use to decide whether policy failures should block. */
export function hasPolicyFailures(results: readonly PolicyResult[]): boolean {
  return results.some((result) => result.status === 'fail');
}

/**
 * Runs every policy's `check` against `context`, applying `config.overrides`
 * within the rules §16 requires:
 *
 * - A mandatory policy's severity can never be changed by an override
 *   (attempting to do so is rejected and the default severity is kept —
 *   this is what makes a mandatory policy actually mandatory).
 * - A non-mandatory override that *weakens* severity (error -> warning,
 *   error -> skip, warning -> skip) requires a non-empty `justification`;
 *   without one, the override is rejected and the default severity is kept.
 * - A non-mandatory override that leaves severity unchanged or *tightens*
 *   it (warning -> error) always applies, justification or not.
 * - `skip` short-circuits the policy entirely: its `check` is not run.
 */
export function evaluatePolicies(
  policies: readonly PolicyDefinition[],
  context: PolicyContext,
  config: PolicyEngineConfig = {},
): EvaluatePoliciesResult {
  const results: PolicyResult[] = [];
  const diagnostics: Diagnostic[] = [];
  const overrides = config.overrides ?? {};
  const knownPolicyIds = new Set(policies.map((policy) => policy.id));

  for (const policyId of Object.keys(overrides)) {
    if (!knownPolicyIds.has(policyId)) {
      diagnostics.push({
        code: POLICY_ENGINE_DIAGNOSTIC_CODES.UNKNOWN_POLICY_OVERRIDE.code,
        severity: 'error',
        message: `Policy override configuration references unknown policy ID "${policyId}".`,
      });
    }
  }

  for (const policy of policies) {
    const override = overrides[policy.id];
    let effectiveSeverity: PolicySeverity | 'skip' = policy.defaultSeverity;

    if (override?.severity !== undefined && override.severity !== policy.defaultSeverity) {
      if (policy.mandatory) {
        diagnostics.push({
          code: POLICY_ENGINE_DIAGNOSTIC_CODES.MANDATORY_POLICY_OVERRIDE_REJECTED.code,
          severity: 'error',
          message: `Policy "${policy.id}" (${policy.name}) is mandatory; its severity cannot be overridden to "${override.severity}". Keeping "${policy.defaultSeverity}".`,
        });
      } else if (isDowngrade(policy.defaultSeverity, override.severity) && !override.justification?.trim()) {
        diagnostics.push({
          code: POLICY_ENGINE_DIAGNOSTIC_CODES.MISSING_OVERRIDE_JUSTIFICATION.code,
          severity: 'error',
          message: `Overriding policy "${policy.id}" (${policy.name}) from "${policy.defaultSeverity}" to "${override.severity}" requires a non-empty justification. Keeping "${policy.defaultSeverity}".`,
        });
      } else {
        effectiveSeverity = override.severity;
      }
    }

    if (effectiveSeverity === 'skip') {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        status: 'skip',
        message: `Skipped by configuration override (${override?.justification?.trim() ?? 'no justification recorded'}).`,
      });
      continue;
    }

    const findings = policy.check(context);
    if (findings.length === 0) {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        status: 'pass',
        message: 'No violations found.',
      });
      continue;
    }

    const status = effectiveSeverity === 'error' ? 'fail' : 'warn';
    for (const finding of findings) {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        status,
        message: finding.message,
        resourceAddress: finding.resourceAddress,
        remediation: finding.remediation,
      });
    }
  }

  return { results, diagnostics };
}
