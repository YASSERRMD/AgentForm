export interface RunSummary {
  readonly totalTests: number;
  readonly passedTests: number;
  readonly totalCostUsd: number;
  /** Count of failing built-in policy checks over the specification itself — supplied by the caller from a real `@agentform/policy` evaluation, not computed here (this package has no policy-engine dependency). */
  readonly policyViolationCount: number;
}

export interface ThresholdGateResult {
  readonly key: string;
  readonly thresholdValue: number;
  readonly measuredValue: number;
  readonly passed: boolean;
  /** `false` for a threshold key this package doesn't know how to gate — surfaced as a warning by the caller (never silently dropped, per §12's "do not silently ignore" line), but doesn't block the overall result on its own. */
  readonly recognized: boolean;
}

/**
 * `evaluations.thresholds` is a free-form `Record<string, number>` in the
 * schema (any string key is technically valid) — but the build spec's own
 * canonical example names exactly these three keys, so they're the only
 * ones this package actively gates: `taskSuccess` (minimum pass rate,
 * 0-1), `policyViolations` (maximum allowed failing policy checks),
 * `maximumAverageCostUsd` (maximum mean cost per test case).
 */
const KNOWN_THRESHOLD_GATES: Readonly<
  Record<
    string,
    (thresholdValue: number, summary: RunSummary) => { measured: number; passed: boolean }
  >
> = {
  taskSuccess: (threshold, summary) => {
    const measured = summary.totalTests === 0 ? 0 : summary.passedTests / summary.totalTests;
    return { measured, passed: measured >= threshold };
  },
  policyViolations: (threshold, summary) => ({
    measured: summary.policyViolationCount,
    passed: summary.policyViolationCount <= threshold,
  }),
  maximumAverageCostUsd: (threshold, summary) => {
    const measured = summary.totalTests === 0 ? 0 : summary.totalCostUsd / summary.totalTests;
    return { measured, passed: measured <= threshold };
  },
};

export function evaluateThresholds(
  thresholds: Readonly<Record<string, number>>,
  summary: RunSummary,
): readonly ThresholdGateResult[] {
  return Object.entries(thresholds).map(([key, thresholdValue]) => {
    const gate = KNOWN_THRESHOLD_GATES[key];
    if (!gate) {
      return { key, thresholdValue, measuredValue: Number.NaN, passed: true, recognized: false };
    }
    const { measured, passed } = gate(thresholdValue, summary);
    return { key, thresholdValue, measuredValue: measured, passed, recognized: true };
  });
}
