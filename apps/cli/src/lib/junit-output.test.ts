import { describe, expect, it } from 'vitest';
import type { TestCaseResult } from '@agentform/evaluator';
import { formatJUnitXml } from './junit-output.js';

function passingResult(name: string): TestCaseResult {
  return {
    name,
    workflow: 'main',
    passed: true,
    assertionResults: [
      {
        assertion: { type: 'nodeVisited', node: 'intake' },
        passed: true,
        message: '"intake" was visited',
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

function failingResult(name: string, message: string): TestCaseResult {
  return {
    name,
    workflow: 'main',
    passed: false,
    assertionResults: [
      { assertion: { type: 'terminationReason', equals: 'complete' }, passed: false, message },
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

describe('formatJUnitXml', () => {
  it('reports zero tests and zero failures for an empty result set', () => {
    const xml = formatJUnitXml([]);
    expect(xml).toContain('<testsuites tests="0" failures="0">');
  });

  it('emits a self-closing <testcase> with no <failure> for a passing result', () => {
    const xml = formatJUnitXml([passingResult('reaches the terminal node')]);
    expect(xml).toContain('<testsuites tests="1" failures="0">');
    expect(xml).toContain('<testcase name="reaches the terminal node" classname="main" />');
    expect(xml).not.toContain('<failure');
  });

  it('emits a <failure> naming the failing assertion for a failing result', () => {
    const xml = formatJUnitXml([
      failingResult('wrong termination reason', 'termination reason was "x", expected "complete"'),
    ]);
    expect(xml).toContain('<testsuites tests="1" failures="1">');
    expect(xml).toContain('<failure message="terminationReason: termination reason was');
  });

  it('falls back to the run error when a test case errored rather than failed an assertion', () => {
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
    const xml = formatJUnitXml([errored]);
    expect(xml).toContain('No workflow &quot;does-not-exist&quot; in this project');
  });

  it('escapes XML-significant characters in names and messages', () => {
    const xml = formatJUnitXml([
      failingResult('a <weird> & "quoted" name', 'expected <a> got "b" & c'),
    ]);
    expect(xml).toContain('name="a &lt;weird&gt; &amp; &quot;quoted&quot; name"');
    expect(xml).not.toContain('<weird>');
  });

  it('counts mixed pass/fail results correctly and lists every test case', () => {
    const xml = formatJUnitXml([
      passingResult('first'),
      failingResult('second', 'boom'),
      passingResult('third'),
    ]);
    expect(xml).toContain('<testsuites tests="3" failures="1">');
    expect(xml).toContain('name="first"');
    expect(xml).toContain('name="second"');
    expect(xml).toContain('name="third"');
  });

  it('honors a custom suite name', () => {
    const xml = formatJUnitXml([passingResult('x')], 'my custom suite');
    expect(xml).toContain('<testsuite name="my custom suite"');
  });
});
