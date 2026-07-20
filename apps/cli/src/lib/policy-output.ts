import type { Diagnostic } from '@agentform/diagnostics';
import type { PolicyResult } from '@agentform/policy';

/**
 * Converts `fail`/`warn` policy results into `Diagnostic`s so they flow
 * through the CLI's existing diagnostics formatting and exit-code
 * machinery unchanged — `pass`/`skip` results don't produce diagnostics,
 * matching how every other pipeline stage's diagnostics only report
 * problems. A diagnostic's `code` is the policy ID itself (e.g.
 * `"AF003"`); `exitCodeForDiagnostics` recognizes that prefix.
 */
export function policyResultsToDiagnostics(results: readonly PolicyResult[]): Diagnostic[] {
  return results
    .filter((result) => result.status === 'fail' || result.status === 'warn')
    .map((result) => ({
      code: result.policyId,
      severity: result.status === 'fail' ? ('error' as const) : ('warning' as const),
      message: `[${result.policyId} ${result.policyName}] ${result.message}`,
      path: result.resourceAddress ? result.resourceAddress.split('.') : undefined,
    }));
}

export interface PolicySummary {
  readonly total: number;
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
  readonly skip: number;
}

export function summarizePolicyResults(results: readonly PolicyResult[]): PolicySummary {
  return {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
  };
}

export function formatPolicySummary(summary: PolicySummary): string {
  return `Policy: ${summary.total} evaluated — ${summary.pass} passed, ${summary.warn} warned, ${summary.fail} failed, ${summary.skip} skipped.`;
}
