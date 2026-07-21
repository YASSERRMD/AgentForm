import type { TestCaseResult, ThresholdGateResult } from '@agentform/evaluator';

export function formatTestResultsForHumans(
  results: readonly TestCaseResult[],
  thresholds: readonly ThresholdGateResult[],
): string {
  if (results.length === 0) {
    return 'No test cases to run — spec.evaluations declares no datasets.\n';
  }

  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name} (${result.workflow})`);
    if (result.error) {
      lines.push(`      error: ${result.error}`);
      continue;
    }
    for (const assertion of result.assertionResults) {
      if (!assertion.passed) {
        lines.push(`      ✗ ${assertion.assertion.type}: ${assertion.message}`);
      }
    }
  }

  const passed = results.filter((result) => result.passed).length;
  lines.push('', `${passed} passed, ${results.length - passed} failed (${results.length} total)`);

  if (thresholds.length > 0) {
    lines.push('', 'Thresholds:');
    for (const gate of thresholds) {
      if (!gate.recognized) {
        lines.push(`  ${gate.key}: unrecognized threshold key — not gated`);
        continue;
      }
      lines.push(
        `  ${gate.key}: ${gate.measuredValue} (threshold ${gate.thresholdValue}) — ${gate.passed ? 'PASS' : 'FAIL'}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
