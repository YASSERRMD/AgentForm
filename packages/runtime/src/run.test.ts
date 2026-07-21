import { describe, expect, it } from 'vitest';
import { runWorkflow, WorkflowRunError } from './run.js';
import {
  approvalIR,
  branchingIR,
  linearIR,
  loopIR,
  retryIR,
  subworkflowIR,
} from './test-fixtures.js';

describe('runWorkflow — linear workflow', () => {
  it('visits every node in order and records the terminate reason', () => {
    const trace = runWorkflow(linearIR(), { workflow: 'main' });
    expect(trace.visitedNodes).toEqual(['assistant', 'done']);
    expect(trace.terminationReason).toBe('complete');
  });

  it('invokes declared tool calls and records their mocked results', () => {
    const trace = runWorkflow(linearIR(), {
      workflow: 'main',
      mocks: { lookup: { return: { found: true } } },
      nodes: { assistant: { toolCalls: [{ tool: 'lookup', args: { query: 'widgets' } }] } },
    });
    expect(trace.toolCalls).toEqual([
      { nodeId: 'assistant', tool: 'lookup', args: { query: 'widgets' }, result: { found: true } },
    ]);
  });

  it('sums declared cost and latency across tool calls', () => {
    const trace = runWorkflow(linearIR(), {
      workflow: 'main',
      mocks: { lookup: { return: 'ok', costUsd: 0.02, latencyMs: 120 } },
      nodes: { assistant: { toolCalls: [{ tool: 'lookup' }, { tool: 'lookup' }] } },
    });
    expect(trace.costUsd).toBeCloseTo(0.04);
    expect(trace.latencyMs).toBe(240);
  });

  it('records the finalOutput a scenario declares for an agent node', () => {
    const trace = runWorkflow(linearIR(), {
      workflow: 'main',
      nodes: { assistant: { output: { confidence: 0.9 } } },
    });
    expect(trace.finalOutput).toEqual({ confidence: 0.9 });
  });

  it('throws a clear error for an unknown workflow id', () => {
    expect(() => runWorkflow(linearIR(), { workflow: 'does-not-exist' })).toThrow(WorkflowRunError);
  });
});

describe('runWorkflow — branching', () => {
  it('requires nodes[id].next when a node has more than one outgoing edge', () => {
    expect(() => runWorkflow(branchingIR(), { workflow: 'main' })).toThrow(/has 2 outgoing edges/);
  });

  it('follows the scenario-declared branch', () => {
    const trace = runWorkflow(branchingIR(), {
      workflow: 'main',
      nodes: { intake: { next: 'tech' } },
    });
    expect(trace.visitedNodes).toEqual(['intake', 'tech', 'done']);
  });

  it('rejects a next target that is not a real outgoing edge', () => {
    expect(() =>
      runWorkflow(branchingIR(), { workflow: 'main', nodes: { intake: { next: 'nowhere' } } }),
    ).toThrow(/no such outgoing edge/);
  });
});

describe('runWorkflow — loop nodes', () => {
  it('enforces the node’s real maxIterations, terminating with loop-limit-exceeded', () => {
    const trace = runWorkflow(loopIR(3), {
      workflow: 'main',
      nodes: { refine: { next: 'refine' } },
    });
    expect(trace.terminationReason).toBe('loop-limit-exceeded');
    expect(trace.visitedNodes.filter((id) => id === 'refine')).toHaveLength(3);
  });

  it('exits the loop cleanly when the scenario routes out before the limit', () => {
    const trace = runWorkflow(loopIR(3), {
      workflow: 'main',
      nodes: { refine: { next: 'done' } },
    });
    expect(trace.visitedNodes).toEqual(['refine', 'done']);
    expect(trace.terminationReason).toBe('terminate');
  });
});

describe('runWorkflow — human approval', () => {
  it('defaults to approved and continues past the gate', () => {
    const trace = runWorkflow(approvalIR(), { workflow: 'main' });
    expect(trace.approvalRequests).toEqual([{ nodeId: 'approve', approved: true }]);
    expect(trace.visitedNodes).toEqual(['drafter', 'approve', 'executor', 'done']);
  });

  it('halts at the gate and records approval-rejected when the scenario declines', () => {
    const trace = runWorkflow(approvalIR(), {
      workflow: 'main',
      nodes: { approve: { approve: false } },
    });
    expect(trace.approvalRequests).toEqual([{ nodeId: 'approve', approved: false }]);
    expect(trace.terminationReason).toBe('approval-rejected');
    expect(trace.visitedNodes).toEqual(['drafter', 'approve']);
  });
});

describe('runWorkflow — retry path', () => {
  it("retries a failing tool call up to the agent's real retry.maxAttempts, then succeeds", () => {
    const trace = runWorkflow(retryIR(2), {
      workflow: 'main',
      mocks: { flaky: { return: 'ok', failCount: 2 } },
      nodes: { assistant: { toolCalls: [{ tool: 'flaky' }] } },
    });
    expect(trace.retryCount).toBe(2);
    expect(trace.toolCalls).toEqual([
      { nodeId: 'assistant', tool: 'flaky', args: {}, result: 'ok' },
    ]);
    expect(trace.terminationReason).toBe('terminate');
  });

  it('terminates with a tool-failed reason when failures exceed maxAttempts', () => {
    const trace = runWorkflow(retryIR(1), {
      workflow: 'main',
      mocks: { flaky: { failCount: 5 } },
      nodes: { assistant: { toolCalls: [{ tool: 'flaky' }] } },
    });
    expect(trace.terminationReason).toBe('tool-failed:flaky');
    expect(trace.toolCalls).toEqual([]);
  });
});

describe('runWorkflow — subworkflow nesting', () => {
  it('merges the nested trace into the parent trace', () => {
    const trace = runWorkflow(subworkflowIR(), { workflow: 'main' });
    expect(trace.visitedNodes).toEqual(['delegate', 'helper', 'subDone', 'done']);
    // The subworkflow's own termination ("sub-complete") doesn't halt the
    // parent — execution continues past the `subworkflow` node to the
    // parent's own `done`, whose default reason wins.
    expect(trace.terminationReason).toBe('terminate');
  });

  it("still records the nested run's own events in the merged trace, including its own terminated event", () => {
    const trace = runWorkflow(subworkflowIR(), { workflow: 'main' });
    expect(trace.events.map((event) => [event.type, event.nodeId])).toEqual([
      ['nodeVisited', 'delegate'],
      ['nodeVisited', 'helper'],
      ['nodeVisited', 'subDone'],
      ['terminated', undefined], // the nested run's own terminate, reason "sub-complete"
      ['nodeVisited', 'done'],
      ['terminated', undefined], // the parent run's own terminate, reason "terminate"
    ]);
  });
});

describe('runWorkflow — safety valve', () => {
  it('stops at maxSteps rather than looping forever when a scenario never routes out', () => {
    const trace = runWorkflow(loopIR(1000), {
      workflow: 'main',
      maxSteps: 5,
      nodes: { refine: { next: 'refine' } },
    });
    expect(trace.terminationReason).toBe('max-steps-exceeded');
  });
});
