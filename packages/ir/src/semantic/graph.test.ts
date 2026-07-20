import { describe, expect, it } from 'vitest';
import { validateWorkflowGraph } from './graph.js';
import type { Workflow } from '@agentform/schema';

function workflow(overrides: Partial<Workflow>): Workflow {
  return {
    entrypoint: 'start',
    nodes: { start: { type: 'agent', agent: 'assistant' } },
    ...overrides,
  };
}

describe('validateWorkflowGraph', () => {
  it('passes a single-node workflow (implicit terminal: the entrypoint is a sink)', () => {
    expect(validateWorkflowGraph('main', workflow({}))).toEqual([]);
  });

  it('passes a valid branching graph with an explicit terminate node', () => {
    const wf = workflow({
      entrypoint: 'start',
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        approve: { type: 'humanApproval' },
        done: { type: 'terminate' },
      },
      edges: [
        { from: 'start', to: 'approve', when: 'output.confidence < 0.85' },
        { from: 'start', to: 'done', when: 'output.confidence >= 0.85' },
        { from: 'approve', to: 'done' },
      ],
    });
    expect(validateWorkflowGraph('main', wf)).toEqual([]);
  });

  it('passes a valid parallel/join graph', () => {
    const wf = workflow({
      entrypoint: 'fanOut',
      nodes: {
        fanOut: { type: 'parallel', branches: ['a', 'b'] },
        a: { type: 'agent', agent: 'assistant' },
        b: { type: 'agent', agent: 'assistant' },
        join: { type: 'join' },
      },
      edges: [
        { from: 'fanOut', to: 'a' },
        { from: 'fanOut', to: 'b' },
        { from: 'a', to: 'join' },
        { from: 'b', to: 'join' },
      ],
    });
    expect(validateWorkflowGraph('main', wf)).toEqual([]);
  });

  it('passes a loop bounded by a loop node with maxIterations', () => {
    const wf = workflow({
      entrypoint: 'draft',
      nodes: {
        draft: { type: 'agent', agent: 'assistant' },
        reviewLoop: { type: 'loop', maxIterations: 3 },
        done: { type: 'terminate' },
      },
      edges: [
        { from: 'draft', to: 'reviewLoop' },
        { from: 'reviewLoop', to: 'draft', when: 'needsRevision' },
        { from: 'reviewLoop', to: 'done', when: '!needsRevision' },
      ],
    });
    expect(validateWorkflowGraph('main', wf)).toEqual([]);
  });

  it('reports AGF3004 for an entrypoint that is not a declared node', () => {
    const diagnostics = validateWorkflowGraph('main', workflow({ entrypoint: 'missing' }));
    expect(diagnostics.some((d) => d.code === 'AGF3004')).toBe(true);
  });

  it('reports AGF3004 for an edge referencing an unknown node', () => {
    const wf = workflow({ edges: [{ from: 'start', to: 'missing' }] });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3004')).toBe(true);
  });

  it('reports AGF3005 for a node unreachable from the entrypoint', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        orphan: { type: 'agent', agent: 'assistant' },
      },
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3005');
  });

  it('reports AGF3006 when no path from the entrypoint reaches a terminal node', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        next: { type: 'agent', agent: 'assistant' },
      },
      edges: [
        { from: 'start', to: 'next' },
        { from: 'next', to: 'start' },
      ],
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3006')).toBe(true);
  });

  it('reports AGF3007 for a cycle not bounded by a loop node', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        next: { type: 'agent', agent: 'assistant' },
        done: { type: 'terminate' },
      },
      edges: [
        { from: 'start', to: 'next' },
        { from: 'next', to: 'start', when: 'retry' },
        { from: 'next', to: 'done', when: '!retry' },
      ],
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3007')).toBe(true);
  });

  it('reports AGF3008 for a duplicate transition', () => {
    const wf = workflow({
      edges: [
        { from: 'start', to: 'start', when: 'x' },
        { from: 'start', to: 'start', when: 'x' },
      ],
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3008')).toBe(true);
  });

  it('reports AGF3009 for two unconditional outgoing edges from the same node', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        a: { type: 'terminate' },
        b: { type: 'terminate' },
      },
      edges: [
        { from: 'start', to: 'a' },
        { from: 'start', to: 'b' },
      ],
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3009')).toBe(true);
  });

  it('does not flag conflicting transitions when only one outgoing edge is unconditional', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        a: { type: 'terminate' },
        b: { type: 'terminate' },
      },
      edges: [
        { from: 'start', to: 'a', when: 'x' },
        { from: 'start', to: 'b' },
      ],
    });
    expect(validateWorkflowGraph('main', wf)).toEqual([]);
  });

  it('reports AGF3010 when an edge guards on approval.* from a non-humanApproval node', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'agent', agent: 'assistant' },
        done: { type: 'terminate' },
      },
      edges: [{ from: 'start', to: 'done', when: 'approval.status == "approved"' }],
    });
    const diagnostics = validateWorkflowGraph('main', wf);
    expect(diagnostics.some((d) => d.code === 'AGF3010')).toBe(true);
  });

  it('accepts an approval.* guard from a humanApproval node', () => {
    const wf = workflow({
      nodes: {
        start: { type: 'humanApproval' },
        done: { type: 'terminate' },
      },
      edges: [{ from: 'start', to: 'done', when: 'approval.status == "approved"' }],
    });
    expect(validateWorkflowGraph('main', wf)).toEqual([]);
  });
});
