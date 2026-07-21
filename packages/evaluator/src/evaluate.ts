import { parseDurationMs } from '@agentform/core';
import type { ExecutionTrace } from '@agentform/runtime';
// The default import resolves to ajv's namespace object (not the
// constructable class) under this repo's `moduleResolution: "NodeNext"` —
// a known ajv+TypeScript interop gotcha, verified directly (`import Ajv
// from 'ajv'` fails with "This expression is not constructable"). ajv
// also exports the same class under a named `Ajv` export, which resolves
// correctly.
import { Ajv } from 'ajv';
import type { Assertion } from './assertion.js';
import { deepEqual } from './deep-equal.js';
import { getByPath } from './get-by-path.js';

export interface AssertionResult {
  readonly assertion: Assertion;
  readonly passed: boolean;
  readonly message: string;
}

/**
 * Data an assertion needs beyond the trace itself — currently just
 * whether the run's policy evaluation passed, since `@agentform/policy`
 * is a separate subsystem the evaluator doesn't re-implement. Optional:
 * a `policyResult` assertion against a context that never ran policy
 * evaluation fails cleanly with an explanatory message rather than
 * silently assuming success.
 */
export interface EvaluationContext {
  readonly policyPassed?: boolean;
}

const ajv = new Ajv({ allErrors: true, strict: false });

function outcome(assertion: Assertion, passed: boolean, message: string): AssertionResult {
  return { assertion, passed, message };
}

/** Evaluates one assertion against one `ExecutionTrace` — pure, synchronous, and side-effect-free, so a dataset run can evaluate every assertion for every test case without re-running anything. */
export function evaluateAssertion(
  assertion: Assertion,
  trace: ExecutionTrace,
  context: EvaluationContext = {},
): AssertionResult {
  switch (assertion.type) {
    case 'exactMatch': {
      const actual = getByPath(trace.finalOutput, assertion.path);
      const passed = deepEqual(actual, assertion.equals);
      return outcome(
        assertion,
        passed,
        passed
          ? `"${assertion.path}" equals ${JSON.stringify(assertion.equals)}`
          : `"${assertion.path}" was ${JSON.stringify(actual)}, expected ${JSON.stringify(assertion.equals)}`,
      );
    }

    case 'jsonSchemaValid': {
      const actual = assertion.path
        ? getByPath(trace.finalOutput, assertion.path)
        : trace.finalOutput;
      const validate = ajv.compile(assertion.schema);
      const passed = validate(actual);
      const errors = (validate.errors ?? []).map(
        (error) => `${error.instancePath} ${error.message}`,
      );
      return outcome(
        assertion,
        passed,
        passed ? 'matches the declared JSON Schema' : `schema violations: ${errors.join('; ')}`,
      );
    }

    case 'toolCalled': {
      const passed = trace.toolCalls.some((call) => call.tool === assertion.tool);
      return outcome(
        assertion,
        passed,
        passed ? `"${assertion.tool}" was called` : `"${assertion.tool}" was never called`,
      );
    }

    case 'toolNotCalled': {
      const passed = !trace.toolCalls.some((call) => call.tool === assertion.tool);
      return outcome(
        assertion,
        passed,
        passed
          ? `"${assertion.tool}" was not called`
          : `"${assertion.tool}" was called, but must not be`,
      );
    }

    case 'toolArgumentMatch': {
      const calls = trace.toolCalls.filter((call) => call.tool === assertion.tool);
      const passed = calls.some((call) =>
        deepEqual(call.args[assertion.argument], assertion.equals),
      );
      return outcome(
        assertion,
        passed,
        passed
          ? `a call to "${assertion.tool}" had ${assertion.argument} = ${JSON.stringify(assertion.equals)}`
          : calls.length === 0
            ? `"${assertion.tool}" was never called`
            : `no call to "${assertion.tool}" had ${assertion.argument} = ${JSON.stringify(assertion.equals)} (got ${calls.map((call) => JSON.stringify(call.args[assertion.argument])).join(', ')})`,
      );
    }

    case 'workflowPath': {
      const passed = deepEqual(trace.visitedNodes, assertion.equals);
      return outcome(
        assertion,
        passed,
        passed
          ? 'visited nodes match the expected path exactly'
          : `visited [${trace.visitedNodes.join(', ')}], expected [${assertion.equals.join(', ')}]`,
      );
    }

    case 'nodeVisited': {
      const passed = trace.visitedNodes.includes(assertion.node);
      return outcome(
        assertion,
        passed,
        passed ? `"${assertion.node}" was visited` : `"${assertion.node}" was never visited`,
      );
    }

    case 'nodeNotVisited': {
      const passed = !trace.visitedNodes.includes(assertion.node);
      return outcome(
        assertion,
        passed,
        passed
          ? `"${assertion.node}" was not visited`
          : `"${assertion.node}" was visited, but must not be`,
      );
    }

    case 'maximumToolCalls': {
      const count = assertion.tool
        ? trace.toolCalls.filter((call) => call.tool === assertion.tool).length
        : trace.toolCalls.length;
      const passed = count <= assertion.value;
      const scope = assertion.tool ? `"${assertion.tool}" calls` : 'tool calls';
      return outcome(assertion, passed, `${count} ${scope} (limit ${assertion.value})`);
    }

    case 'maximumRetries': {
      const passed = trace.retryCount <= assertion.value;
      return outcome(assertion, passed, `${trace.retryCount} retries (limit ${assertion.value})`);
    }

    case 'maximumCost': {
      const passed = trace.costUsd <= assertion.valueUsd;
      return outcome(
        assertion,
        passed,
        `cost $${trace.costUsd.toFixed(4)} (limit $${assertion.valueUsd.toFixed(4)})`,
      );
    }

    case 'maximumLatency': {
      const limitMs = parseDurationMs(assertion.value);
      const passed = trace.latencyMs <= limitMs;
      return outcome(assertion, passed, `latency ${trace.latencyMs}ms (limit ${limitMs}ms)`);
    }

    case 'policyResult': {
      if (context.policyPassed === undefined) {
        return outcome(assertion, false, 'no policy evaluation result was provided for this run');
      }
      const passed = context.policyPassed === assertion.passed;
      return outcome(
        assertion,
        passed,
        `policy evaluation ${context.policyPassed ? 'passed' : 'failed'} (expected ${assertion.passed ? 'passed' : 'failed'})`,
      );
    }

    case 'approvalRequested': {
      const passed = assertion.node
        ? trace.approvalRequests.some((request) => request.nodeId === assertion.node)
        : trace.approvalRequests.length > 0;
      return outcome(
        assertion,
        passed,
        passed
          ? 'approval was requested'
          : assertion.node
            ? `no approval was requested at "${assertion.node}"`
            : 'no approval was requested anywhere in the run',
      );
    }

    case 'terminationReason': {
      const passed = trace.terminationReason === assertion.equals;
      return outcome(
        assertion,
        passed,
        `termination reason was ${JSON.stringify(trace.terminationReason)}, expected ${JSON.stringify(assertion.equals)}`,
      );
    }

    case 'fieldRange': {
      const actual = getByPath(trace.finalOutput, assertion.path);
      if (typeof actual !== 'number') {
        return outcome(
          assertion,
          false,
          `"${assertion.path}" was ${JSON.stringify(actual)}, expected a number`,
        );
      }
      const aboveMin = assertion.min === undefined || actual >= assertion.min;
      const belowMax = assertion.max === undefined || actual <= assertion.max;
      const passed = aboveMin && belowMax;
      return outcome(
        assertion,
        passed,
        `"${assertion.path}" = ${actual} (range [${assertion.min ?? '-∞'}, ${assertion.max ?? '∞'}])`,
      );
    }
  }
}

export function evaluateAssertions(
  assertions: readonly Assertion[],
  trace: ExecutionTrace,
  context: EvaluationContext = {},
): readonly AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(assertion, trace, context));
}
