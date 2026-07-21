import { describe, expect, it } from 'vitest';
import { evaluateThresholds, type RunSummary } from './threshold.js';

const summary: RunSummary = {
  totalTests: 10,
  passedTests: 9,
  totalCostUsd: 1.0,
  policyViolationCount: 0,
};

describe('evaluateThresholds', () => {
  it('taskSuccess: gates on a minimum pass rate', () => {
    expect(evaluateThresholds({ taskSuccess: 0.9 }, summary)[0]).toMatchObject({
      measuredValue: 0.9,
      passed: true,
      recognized: true,
    });
    expect(evaluateThresholds({ taskSuccess: 0.95 }, summary)[0]?.passed).toBe(false);
  });

  it('policyViolations: gates on a maximum count', () => {
    expect(evaluateThresholds({ policyViolations: 0 }, summary)[0]?.passed).toBe(true);
    expect(
      evaluateThresholds({ policyViolations: 0 }, { ...summary, policyViolationCount: 1 })[0]
        ?.passed,
    ).toBe(false);
  });

  it('maximumAverageCostUsd: gates on mean cost per test', () => {
    expect(evaluateThresholds({ maximumAverageCostUsd: 0.1 }, summary)[0]).toMatchObject({
      measuredValue: 0.1,
      passed: true,
    });
    expect(evaluateThresholds({ maximumAverageCostUsd: 0.05 }, summary)[0]?.passed).toBe(false);
  });

  it('an unrecognized key is reported but does not block the gate', () => {
    const [result] = evaluateThresholds({ somethingCustom: 42 }, summary);
    expect(result).toMatchObject({ recognized: false, passed: true });
  });

  it('handles zero total tests without dividing by zero', () => {
    const empty: RunSummary = {
      totalTests: 0,
      passedTests: 0,
      totalCostUsd: 0,
      policyViolationCount: 0,
    };
    expect(evaluateThresholds({ taskSuccess: 0.9 }, empty)[0]?.measuredValue).toBe(0);
  });
});
