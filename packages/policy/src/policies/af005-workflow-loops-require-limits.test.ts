import { describe, expect, it } from 'vitest';
import { af005WorkflowLoopsRequireLimits } from './af005-workflow-loops-require-limits.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF005 workflow-loops-require-limits', () => {
  it('passes a workflow with no loop nodes', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af005WorkflowLoopsRequireLimits.check(context)).toEqual([]);
  });

  it('passes a loop node with a positive maxIterations, as the schema always guarantees', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: {
          assistant: { type: 'agent', agent: 'assistant' },
          retryLoop: { type: 'loop', maxIterations: 5 },
        },
        edges: [{ from: 'assistant', to: 'retryLoop' }],
      };
    });
    expect(af005WorkflowLoopsRequireLimits.check({ application: app })).toEqual([]);
  });

  it('catches a loop node with a non-positive maxIterations, as defense in depth against data that bypassed schema validation', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: {
          assistant: { type: 'agent', agent: 'assistant' },
          retryLoop: { type: 'loop', maxIterations: 5 },
        },
        edges: [{ from: 'assistant', to: 'retryLoop' }],
      };
    });
    // The schema forbids maxIterations <= 0, so this simulates a
    // PolicyContext built from data that never went through
    // validateAgenticApplication in the first place.
    const retryLoop = app.spec.workflows.main?.nodes.retryLoop as { maxIterations: number };
    retryLoop.maxIterations = 0;

    const findings = af005WorkflowLoopsRequireLimits.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.workflows.main.nodes.retryLoop');
  });
});
