import type { Diagnostic } from '@agentform/diagnostics';
import type { PolicyResult } from './types.js';

/**
 * Converts `fail`/`warn` policy results into `Diagnostic`s so they flow
 * through whichever caller's own diagnostics formatting and blocking
 * logic unchanged — `pass`/`skip` results don't produce diagnostics,
 * matching how every other pipeline stage's diagnostics only report
 * problems. A diagnostic's `code` is the policy ID itself (e.g.
 * `"AF003"`). Moved here from the CLI in Phase 14 when studio-server's
 * write path became the second real caller.
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
