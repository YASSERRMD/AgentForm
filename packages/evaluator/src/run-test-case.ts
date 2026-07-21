import type { AgentformIR } from '@agentform/ir';
import { runWorkflow, type ExecutionTrace } from '@agentform/runtime';
import type { AssertionResult, EvaluationContext } from './evaluate.js';
import { evaluateAssertions } from './evaluate.js';
import type { TestCase } from './test-case.js';

export interface TestCaseResult {
  readonly name: string;
  readonly workflow: string;
  readonly passed: boolean;
  readonly assertionResults: readonly AssertionResult[];
  readonly trace: ExecutionTrace;
  /** Set when the run itself failed (e.g. an unknown workflow, or an ambiguous branch the test case didn't disambiguate) before any assertion could even be evaluated — distinct from an assertion failing normally. */
  readonly error?: string;
}

const EMPTY_TRACE = (workflow: string): ExecutionTrace => ({
  workflow,
  events: [],
  visitedNodes: [],
  toolCalls: [],
  approvalRequests: [],
  retryCount: 0,
  costUsd: 0,
  latencyMs: 0,
});

/** Runs one test case's scenario through `@agentform/runtime`, then evaluates every declared assertion against the resulting trace. A run-time error (not an assertion failure) is caught and reported as a failed test case rather than propagating — one malformed test case shouldn't crash an entire dataset run. */
export function runTestCase(
  ir: AgentformIR,
  testCase: TestCase,
  context: EvaluationContext = {},
): TestCaseResult {
  let trace: ExecutionTrace;
  try {
    trace = runWorkflow(ir, {
      workflow: testCase.workflow,
      input: testCase.input,
      mocks: testCase.mocks,
      nodes: testCase.nodes,
      maxSteps: testCase.maxSteps,
    });
  } catch (error) {
    return {
      name: testCase.name,
      workflow: testCase.workflow,
      passed: false,
      assertionResults: [],
      trace: EMPTY_TRACE(testCase.workflow),
      error: (error as Error).message,
    };
  }

  const assertionResults = evaluateAssertions(testCase.assertions, trace, context);
  return {
    name: testCase.name,
    workflow: testCase.workflow,
    passed: assertionResults.every((result) => result.passed),
    assertionResults,
    trace,
  };
}

export function runDataset(
  ir: AgentformIR,
  testCases: readonly TestCase[],
  context: EvaluationContext = {},
): readonly TestCaseResult[] {
  return testCases.map((testCase) => runTestCase(ir, testCase, context));
}
