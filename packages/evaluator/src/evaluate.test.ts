import type { ExecutionTrace } from '@agentform/runtime';
import { describe, expect, it } from 'vitest';
import type { Assertion } from './assertion.js';
import { evaluateAssertion } from './evaluate.js';

function trace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    workflow: 'main',
    events: [],
    visitedNodes: ['intake', 'done'],
    toolCalls: [
      {
        nodeId: 'intake',
        tool: 'search',
        args: { locationId: 'LOC-101' },
        result: { duplicateFound: true },
      },
    ],
    approvalRequests: [],
    retryCount: 1,
    terminationReason: 'duplicate-found',
    costUsd: 0.05,
    latencyMs: 800,
    finalOutput: { confidence: 0.8, summary: 'Duplicate detected' },
    ...overrides,
  };
}

describe('evaluateAssertion', () => {
  it('exactMatch: passes when the path equals the expected value', () => {
    const assertion: Assertion = {
      type: 'exactMatch',
      path: 'summary',
      equals: 'Duplicate detected',
    };
    expect(evaluateAssertion(assertion, trace()).passed).toBe(true);
  });

  it('exactMatch: fails on a mismatch, with a message naming both values', () => {
    const assertion: Assertion = { type: 'exactMatch', path: 'summary', equals: 'Something else' };
    const result = evaluateAssertion(assertion, trace());
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Something else');
  });

  it('jsonSchemaValid: passes when finalOutput matches the schema', () => {
    const assertion: Assertion = {
      type: 'jsonSchemaValid',
      schema: {
        type: 'object',
        properties: { confidence: { type: 'number' } },
        required: ['confidence'],
      },
    };
    expect(evaluateAssertion(assertion, trace()).passed).toBe(true);
  });

  it('jsonSchemaValid: fails and reports violations when it does not', () => {
    const assertion: Assertion = {
      type: 'jsonSchemaValid',
      schema: { type: 'object', properties: { confidence: { type: 'string' } } },
    };
    const result = evaluateAssertion(assertion, trace());
    expect(result.passed).toBe(false);
    expect(result.message).toContain('violations');
  });

  it('toolCalled / toolNotCalled', () => {
    expect(evaluateAssertion({ type: 'toolCalled', tool: 'search' }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'toolNotCalled', tool: 'create' }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'toolNotCalled', tool: 'search' }, trace()).passed).toBe(
      false,
    );
  });

  it('toolArgumentMatch: passes when some call to the tool had the exact argument', () => {
    const assertion: Assertion = {
      type: 'toolArgumentMatch',
      tool: 'search',
      argument: 'locationId',
      equals: 'LOC-101',
    };
    expect(evaluateAssertion(assertion, trace()).passed).toBe(true);
  });

  it('workflowPath: exact node sequence match', () => {
    expect(
      evaluateAssertion({ type: 'workflowPath', equals: ['intake', 'done'] }, trace()).passed,
    ).toBe(true);
    expect(evaluateAssertion({ type: 'workflowPath', equals: ['intake'] }, trace()).passed).toBe(
      false,
    );
  });

  it('nodeVisited / nodeNotVisited', () => {
    expect(evaluateAssertion({ type: 'nodeVisited', node: 'intake' }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'nodeNotVisited', node: 'escalate' }, trace()).passed).toBe(
      true,
    );
  });

  it('maximumToolCalls: total and per-tool scoping', () => {
    expect(evaluateAssertion({ type: 'maximumToolCalls', value: 1 }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'maximumToolCalls', value: 0 }, trace()).passed).toBe(false);
    expect(
      evaluateAssertion({ type: 'maximumToolCalls', value: 0, tool: 'create' }, trace()).passed,
    ).toBe(true);
  });

  it('maximumRetries', () => {
    expect(evaluateAssertion({ type: 'maximumRetries', value: 1 }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'maximumRetries', value: 0 }, trace()).passed).toBe(false);
  });

  it('maximumCost', () => {
    expect(evaluateAssertion({ type: 'maximumCost', valueUsd: 0.1 }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'maximumCost', valueUsd: 0.01 }, trace()).passed).toBe(false);
  });

  it('maximumLatency: compares against a parsed duration', () => {
    expect(evaluateAssertion({ type: 'maximumLatency', value: '1s' }, trace()).passed).toBe(true);
    expect(evaluateAssertion({ type: 'maximumLatency', value: '500ms' }, trace()).passed).toBe(
      false,
    );
  });

  it('policyResult: uses the supplied context, fails cleanly when absent', () => {
    expect(
      evaluateAssertion({ type: 'policyResult', passed: true }, trace(), { policyPassed: true })
        .passed,
    ).toBe(true);
    expect(
      evaluateAssertion({ type: 'policyResult', passed: true }, trace(), { policyPassed: false })
        .passed,
    ).toBe(false);
    const noContext = evaluateAssertion({ type: 'policyResult', passed: true }, trace());
    expect(noContext.passed).toBe(false);
    expect(noContext.message).toContain('no policy evaluation result');
  });

  it('approvalRequested: anywhere, or at a specific node', () => {
    const withApproval = trace({ approvalRequests: [{ nodeId: 'approve', approved: true }] });
    expect(evaluateAssertion({ type: 'approvalRequested' }, withApproval).passed).toBe(true);
    expect(
      evaluateAssertion({ type: 'approvalRequested', node: 'approve' }, withApproval).passed,
    ).toBe(true);
    expect(evaluateAssertion({ type: 'approvalRequested' }, trace()).passed).toBe(false);
  });

  it('terminationReason', () => {
    expect(
      evaluateAssertion({ type: 'terminationReason', equals: 'duplicate-found' }, trace()).passed,
    ).toBe(true);
    expect(
      evaluateAssertion({ type: 'terminationReason', equals: 'created' }, trace()).passed,
    ).toBe(false);
  });

  it('fieldRange: min/max bounds, and a non-numeric field fails cleanly', () => {
    expect(
      evaluateAssertion({ type: 'fieldRange', path: 'confidence', min: 0.5, max: 1 }, trace())
        .passed,
    ).toBe(true);
    expect(
      evaluateAssertion({ type: 'fieldRange', path: 'confidence', min: 0.9 }, trace()).passed,
    ).toBe(false);
    expect(evaluateAssertion({ type: 'fieldRange', path: 'summary', max: 1 }, trace()).passed).toBe(
      false,
    );
  });
});
