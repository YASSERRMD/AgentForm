import { describe, expect, it } from 'vitest';
import { validateSubworkflows } from './subworkflow.js';
import { withApplication } from '../test-fixtures.js';

describe('validateSubworkflows', () => {
  it('passes when there are no subworkflow nodes', () => {
    expect(validateSubworkflows(withApplication(() => {}))).toEqual([]);
  });

  it('passes a valid subworkflow reference', () => {
    const app = withApplication((a) => {
      a.spec.workflows.sub = {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      };
      a.spec.workflows.main!.nodes.delegate = { type: 'subworkflow', workflow: 'sub' };
    });
    expect(validateSubworkflows(app)).toEqual([]);
  });

  it('reports AGF3013 when a subworkflow node references an unknown workflow', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main!.nodes.delegate = { type: 'subworkflow', workflow: 'does-not-exist' };
    });
    const diagnostics = validateSubworkflows(app);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3013');
  });

  it('reports AGF3014 for a direct circular subworkflow reference', () => {
    const app = withApplication((a) => {
      a.spec.workflows.a = {
        entrypoint: 'start',
        nodes: { start: { type: 'subworkflow', workflow: 'b' } },
      };
      a.spec.workflows.b = {
        entrypoint: 'start',
        nodes: { start: { type: 'subworkflow', workflow: 'a' } },
      };
    });
    const diagnostics = validateSubworkflows(app);
    expect(diagnostics.some((d) => d.code === 'AGF3014')).toBe(true);
  });

  it('reports AGF3014 for an indirect circular subworkflow reference (A -> B -> C -> A)', () => {
    const app = withApplication((a) => {
      a.spec.workflows.a = {
        entrypoint: 'start',
        nodes: { start: { type: 'subworkflow', workflow: 'b' } },
      };
      a.spec.workflows.b = {
        entrypoint: 'start',
        nodes: { start: { type: 'subworkflow', workflow: 'c' } },
      };
      a.spec.workflows.c = {
        entrypoint: 'start',
        nodes: { start: { type: 'subworkflow', workflow: 'a' } },
      };
    });
    const diagnostics = validateSubworkflows(app);
    expect(diagnostics.some((d) => d.code === 'AGF3014')).toBe(true);
  });

  it('does not flag a workflow that calls the same non-circular subworkflow from two places', () => {
    const app = withApplication((a) => {
      a.spec.workflows.shared = {
        entrypoint: 'start',
        nodes: { start: { type: 'agent', agent: 'assistant' } },
      };
      a.spec.workflows.main!.nodes.first = { type: 'subworkflow', workflow: 'shared' };
      a.spec.workflows.main!.nodes.second = { type: 'subworkflow', workflow: 'shared' };
    });
    expect(validateSubworkflows(app)).toEqual([]);
  });
});
