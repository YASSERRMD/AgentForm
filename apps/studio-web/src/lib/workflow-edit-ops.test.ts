import type { Workflow } from '@agentform/studio-core';
import { describe, expect, it } from 'vitest';
import {
  addNode,
  addWorkflowEdge,
  deleteEdge,
  deleteNode,
  minimalNodeOfType,
  setEntrypoint,
  updateEdgeWhen,
  updateNode,
} from './workflow-edit-ops';

const EMPTY_WORKFLOW: Workflow = { entrypoint: '', nodes: {} };

const WORKFLOW_WITH_TWO_NODES: Workflow = {
  entrypoint: 'a',
  nodes: {
    a: { type: 'agent', agent: 'assistant' },
    b: { type: 'tool', tool: 'lookup' },
  },
  edges: [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'b', when: 'retry' },
  ],
};

describe('minimalNodeOfType', () => {
  it('gives every node type a schema-shaped starting value with its own required fields present', () => {
    expect(minimalNodeOfType('agent')).toEqual({ type: 'agent', agent: '' });
    expect(minimalNodeOfType('tool')).toEqual({ type: 'tool', tool: '' });
    expect(minimalNodeOfType('loop')).toEqual({ type: 'loop', maxIterations: 1 });
    expect(minimalNodeOfType('delay')).toEqual({ type: 'delay', duration: '1s' });
    expect(minimalNodeOfType('event')).toEqual({ type: 'event', eventType: '' });
    expect(minimalNodeOfType('subworkflow')).toEqual({ type: 'subworkflow', workflow: '' });
    expect(minimalNodeOfType('condition')).toEqual({ type: 'condition', expression: '' });
    expect(minimalNodeOfType('transform')).toEqual({ type: 'transform', expression: '' });
    expect(minimalNodeOfType('terminate')).toEqual({ type: 'terminate' });
    expect(minimalNodeOfType('humanApproval')).toEqual({ type: 'humanApproval' });
    expect(minimalNodeOfType('router')).toEqual({ type: 'router' });
    expect(minimalNodeOfType('parallel')).toEqual({ type: 'parallel' });
    expect(minimalNodeOfType('join')).toEqual({ type: 'join' });
  });
});

describe('addNode', () => {
  it('adds a node and makes it the entrypoint when the workflow was empty', () => {
    const result = addNode(EMPTY_WORKFLOW, 'first', 'agent');
    expect(result.entrypoint).toBe('first');
    expect(result.nodes.first).toEqual({ type: 'agent', agent: '' });
  });

  it('does not change the entrypoint when one already exists', () => {
    const result = addNode(WORKFLOW_WITH_TWO_NODES, 'c', 'terminate');
    expect(result.entrypoint).toBe('a');
    expect(result.nodes.c).toEqual({ type: 'terminate' });
  });

  it('trims the id and no-ops on a blank id', () => {
    expect(addNode(EMPTY_WORKFLOW, '   ', 'agent')).toBe(EMPTY_WORKFLOW);
    const result = addNode(EMPTY_WORKFLOW, '  spaced  ', 'agent');
    expect(result.nodes.spaced).toBeDefined();
  });

  it('no-ops rather than clobbering an existing node id', () => {
    const result = addNode(WORKFLOW_WITH_TWO_NODES, 'a', 'terminate');
    expect(result).toBe(WORKFLOW_WITH_TWO_NODES);
  });
});

describe('updateNode', () => {
  it('replaces one node in place, leaving the others untouched', () => {
    const result = updateNode(WORKFLOW_WITH_TWO_NODES, 'b', { type: 'tool', tool: 'other' });
    expect(result.nodes.b).toEqual({ type: 'tool', tool: 'other' });
    expect(result.nodes.a).toBe(WORKFLOW_WITH_TWO_NODES.nodes.a);
  });
});

describe('deleteNode', () => {
  it('removes the node and every edge touching it', () => {
    const result = deleteNode(WORKFLOW_WITH_TWO_NODES, 'b');
    expect(result.nodes.b).toBeUndefined();
    expect(result.nodes.a).toBeDefined();
    expect(result.edges).toEqual([]);
  });

  it('leaves edges not touching the deleted node untouched', () => {
    const workflow: Workflow = {
      entrypoint: 'a',
      nodes: {
        a: { type: 'agent', agent: 'x' },
        b: { type: 'terminate' },
        c: { type: 'terminate' },
      },
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    };
    const result = deleteNode(workflow, 'b');
    expect(result.edges).toEqual([{ from: 'a', to: 'c' }]);
  });
});

describe('setEntrypoint', () => {
  it('changes only the entrypoint field', () => {
    const result = setEntrypoint(WORKFLOW_WITH_TWO_NODES, 'b');
    expect(result.entrypoint).toBe('b');
    expect(result.nodes).toBe(WORKFLOW_WITH_TWO_NODES.nodes);
  });
});

describe('addWorkflowEdge', () => {
  it('appends a new edge with no `when`', () => {
    const result = addWorkflowEdge(EMPTY_WORKFLOW, 'x', 'y');
    expect(result.edges).toEqual([{ from: 'x', to: 'y' }]);
  });

  it('appends onto existing edges rather than replacing them', () => {
    const result = addWorkflowEdge(WORKFLOW_WITH_TWO_NODES, 'b', 'a');
    expect(result.edges).toHaveLength(3);
    expect(result.edges?.at(-1)).toEqual({ from: 'b', to: 'a' });
  });
});

describe('deleteEdge', () => {
  it('removes exactly the edge at the given index', () => {
    const result = deleteEdge(WORKFLOW_WITH_TWO_NODES, 0);
    expect(result.edges).toEqual([{ from: 'a', to: 'b', when: 'retry' }]);
  });
});

describe('updateEdgeWhen', () => {
  it('sets a new `when` expression on the given edge only', () => {
    const result = updateEdgeWhen(WORKFLOW_WITH_TWO_NODES, 0, 'needsLookup');
    expect(result.edges?.[0]).toEqual({ from: 'a', to: 'b', when: 'needsLookup' });
    expect(result.edges?.[1]).toEqual(WORKFLOW_WITH_TWO_NODES.edges?.[1]);
  });

  it('clears `when` back to undefined when set to a blank string', () => {
    const result = updateEdgeWhen(WORKFLOW_WITH_TWO_NODES, 1, '   ');
    expect(result.edges?.[1]).toEqual({ from: 'a', to: 'b' });
  });
});
