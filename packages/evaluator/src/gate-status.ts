import type { TestResultsRecord, TestResultsVerificationResult } from './results-record.js';

export type EvaluationGateStatus =
  | { readonly kind: 'never-run' }
  | { readonly kind: 'stale'; readonly lastRanIrHash: string; readonly currentIrHash: string }
  | { readonly kind: 'failed'; readonly record: TestResultsRecord }
  | { readonly kind: 'passed'; readonly record: TestResultsRecord };

/**
 * Compares a project's current `AgentformIR.contentHash` against a parsed
 * `.agentform/test-results.json` (or its absence) — pure and
 * side-effect-free, matching every other "compare recorded state against
 * current reality" function in this codebase (`verifyPlanFile`,
 * `comparePlan`). An invalid/tampered results file is treated the same as
 * no file at all (`never-run`): its content can't be trusted, so there's
 * no honest way to report anything more specific than "no verified run
 * exists". Deciding *whether* this status matters (e.g. only for a
 * production environment) is the caller's job — this function has no
 * opinion on environments.
 */
export function checkEvaluationGateStatus(
  currentIrHash: string,
  resultsFile: TestResultsVerificationResult | undefined,
): EvaluationGateStatus {
  if (!resultsFile || !resultsFile.valid || !resultsFile.record) {
    return { kind: 'never-run' };
  }
  const { record } = resultsFile;
  if (record.irHash !== currentIrHash) {
    return { kind: 'stale', lastRanIrHash: record.irHash, currentIrHash };
  }
  if (!record.success) {
    return { kind: 'failed', record };
  }
  return { kind: 'passed', record };
}
