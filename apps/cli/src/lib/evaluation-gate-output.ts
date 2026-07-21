import type { Diagnostic } from '@agentform/diagnostics';
import { EVALUATOR_DIAGNOSTIC_CODES, type EvaluationGateStatus } from '@agentform/evaluator';

/**
 * Converts an `EvaluationGateStatus` into `Diagnostic`s — always `warning`
 * severity, never `error`, since no `apply` command exists yet to actually
 * gate a deployment on this (Phase 11). `passed` produces nothing, matching
 * how every other pipeline stage's diagnostics only report problems.
 */
export function evaluationGateStatusToDiagnostics(status: EvaluationGateStatus): Diagnostic[] {
  const path = ['spec', 'evaluations'];
  switch (status.kind) {
    case 'passed':
      return [];
    case 'never-run':
      return [
        {
          code: EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_NEVER_RUN.code,
          severity: 'warning',
          message: `${EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_NEVER_RUN.summary} Run "agentform test" before deploying.`,
          path,
        },
      ];
    case 'stale':
      return [
        {
          code: EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_STALE.code,
          severity: 'warning',
          message: `${EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_STALE.summary} Re-run "agentform test" against the current specification.`,
          path,
        },
      ];
    case 'failed':
      return [
        {
          code: EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_FAILED.code,
          severity: 'warning',
          message: `${EVALUATOR_DIAGNOSTIC_CODES.EVALUATION_GATE_FAILED.summary} (${status.record.passedTests}/${status.record.totalTests} tests passed, last run ${status.record.ranAt}.)`,
          path,
        },
      ];
  }
}
