import { describe, expect, it } from 'vitest';
import { validateLimits } from './limits.js';
import { withApplication } from '../test-fixtures.js';

describe('validateLimits', () => {
  it('passes the minimal fixture workflow, well under every default limit', () => {
    const app = withApplication(() => {});
    expect(validateLimits(app)).toEqual([]);
  });

  it('rejects a workflow with more nodes than maxWorkflowNodes', () => {
    const app = withApplication((application) => {
      const nodes: Record<string, { type: 'terminate' }> = {};
      for (let i = 0; i < 5; i += 1) {
        nodes[`node${i}`] = { type: 'terminate' };
      }
      application.spec.workflows.main = { entrypoint: 'node0', nodes };
    });

    const diagnostics = validateLimits(app, { maxWorkflowNodes: 3 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3016');
  });

  it('rejects a workflow with more edges than maxWorkflowEdges', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' }, done: { type: 'terminate' } },
        edges: [
          { from: 'assistant', to: 'done', when: 'a' },
          { from: 'assistant', to: 'done', when: 'b' },
          { from: 'assistant', to: 'done', when: 'c' },
        ],
      };
    });

    const diagnostics = validateLimits(app, { maxWorkflowEdges: 2 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3017');
  });

  it('rejects an edge "when" expression longer than maxExpressionLength', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' }, done: { type: 'terminate' } },
        edges: [{ from: 'assistant', to: 'done', when: 'x'.repeat(50) }],
      };
    });

    const diagnostics = validateLimits(app, { maxExpressionLength: 10 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3018');
    expect(diagnostics[0]?.path).toEqual(['spec', 'workflows', 'main', 'edges', 0, 'when']);
  });

  it('rejects a condition node expression longer than maxExpressionLength', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'gate',
        nodes: { gate: { type: 'condition', expression: 'y'.repeat(50) } },
      };
    });

    const diagnostics = validateLimits(app, { maxExpressionLength: 10 });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3018');
    expect(diagnostics[0]?.path).toEqual([
      'spec',
      'workflows',
      'main',
      'nodes',
      'gate',
      'expression',
    ]);
  });

  it('rejects a transform node expression longer than maxExpressionLength', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'shape',
        nodes: { shape: { type: 'transform', expression: 'z'.repeat(50) } },
      };
    });

    expect(validateLimits(app, { maxExpressionLength: 10 })).toHaveLength(1);
  });

  it('passes expressions at or under the configured maximum length', () => {
    const app = withApplication((application) => {
      application.spec.workflows.main = {
        entrypoint: 'gate',
        nodes: { gate: { type: 'condition', expression: 'short' } },
      };
    });
    expect(validateLimits(app, { maxExpressionLength: 5 })).toEqual([]);
  });
});
