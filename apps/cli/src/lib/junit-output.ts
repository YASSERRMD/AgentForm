import type { TestCaseResult } from '@agentform/evaluator';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function failureMessage(result: TestCaseResult): string {
  if (result.error) return result.error;
  return result.assertionResults
    .filter((assertion) => !assertion.passed)
    .map((assertion) => `${assertion.assertion.type}: ${assertion.message}`)
    .join('\n');
}

/** A minimal, standard JUnit XML report (`<testsuites><testsuite><testcase>`) — the format every CI dashboard already knows how to render, so `agentform test --junit results.xml` slots into existing pipelines without a custom parser. */
export function formatJUnitXml(
  results: readonly TestCaseResult[],
  suiteName = 'agentform test',
): string {
  const failures = results.filter((result) => !result.passed).length;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${results.length}" failures="${failures}">`,
    `  <testsuite name="${escapeXml(suiteName)}" tests="${results.length}" failures="${failures}">`,
  ];

  for (const result of results) {
    if (result.passed) {
      lines.push(
        `    <testcase name="${escapeXml(result.name)}" classname="${escapeXml(result.workflow)}" />`,
      );
      continue;
    }
    const message = failureMessage(result) || 'test failed';
    lines.push(
      `    <testcase name="${escapeXml(result.name)}" classname="${escapeXml(result.workflow)}">`,
      `      <failure message="${escapeXml(message)}">${escapeXml(message)}</failure>`,
      '    </testcase>',
    );
  }

  lines.push('  </testsuite>', '</testsuites>', '');
  return lines.join('\n');
}
