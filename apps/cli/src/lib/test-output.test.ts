import { describe, expect, it } from 'vitest';
import type { TestCaseResult, ThresholdGateResult } from '@agentform/evaluator';
import { formatTestResultsForHumans } from './test-output.js';

function result(name: string, passed: boolean): TestCaseResult {
  return {
    name,
    workflow: 'main',
    passed,
    assertionResults: passed
      ? [
          {
            assertion: { type: 'nodeVisited', node: 'intake' },
            passed: true,
            message: '"intake" was visited',
          },
        ]
      : [
          {
            assertion: { type: 'terminationReason', equals: 'complete' },
            passed: false,
            message: 'termination reason was "x", expected "complete"',
          },
        ],
    trace: {
      workflow: 'main',
      events: [],
      visitedNodes: ['intake'],
      toolCalls: [],
      approvalRequests: [],
      retryCount: 0,
      costUsd: 0,
      latencyMs: 0,
    },
  };
}

describe('formatTestResultsForHumans', () => {
  it('reports "no test cases" when the dataset is empty', () => {
    expect(formatTestResultsForHumans([], [])).toBe(
      'No test cases to run — spec.evaluations declares no datasets.\n',
    );
  });

  it('reports the dataset pass rate across a mix of passing and failing cases', () => {
    const output = formatTestResultsForHumans(
      [result('a', true), result('b', false), result('c', true)],
      [],
    );
    expect(output).toContain('PASS  a (main)');
    expect(output).toContain('FAIL  b (main)');
    expect(output).toContain('PASS  c (main)');
    expect(output).toContain('2 passed, 1 failed (3 total)');
  });

  it('names the specific failing assertion under a FAIL line', () => {
    const output = formatTestResultsForHumans([result('b', false)], []);
    expect(output).toContain(
      '✗ terminationReason: termination reason was "x", expected "complete"',
    );
  });

  it('reports a run-time error instead of assertion detail when the case errored', () => {
    const errored: TestCaseResult = {
      name: 'bad workflow reference',
      workflow: 'does-not-exist',
      passed: false,
      assertionResults: [],
      trace: {
        workflow: 'does-not-exist',
        events: [],
        visitedNodes: [],
        toolCalls: [],
        approvalRequests: [],
        retryCount: 0,
        costUsd: 0,
        latencyMs: 0,
      },
      error: 'No workflow "does-not-exist" in this project',
    };
    const output = formatTestResultsForHumans([errored], []);
    expect(output).toContain('error: No workflow "does-not-exist" in this project');
  });

  it('lists recognized thresholds with PASS/FAIL and flags unrecognized keys without gating them', () => {
    const thresholds: ThresholdGateResult[] = [
      { key: 'taskSuccess', thresholdValue: 0.9, measuredValue: 1, passed: true, recognized: true },
      {
        key: 'maximumAverageCostUsd',
        thresholdValue: 0.01,
        measuredValue: 0.05,
        passed: false,
        recognized: true,
      },
      {
        key: 'somethingCustom',
        thresholdValue: 1,
        measuredValue: Number.NaN,
        passed: true,
        recognized: false,
      },
    ];
    const output = formatTestResultsForHumans([result('a', true)], thresholds);
    expect(output).toContain('taskSuccess: 1 (threshold 0.9) — PASS');
    expect(output).toContain('maximumAverageCostUsd: 0.05 (threshold 0.01) — FAIL');
    expect(output).toContain('somethingCustom: unrecognized threshold key — not gated');
  });

  it('omits the Thresholds section entirely when no thresholds are declared', () => {
    const output = formatTestResultsForHumans([result('a', true)], []);
    expect(output).not.toContain('Thresholds:');
  });
});
