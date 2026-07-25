import type { Workflow } from '@agentform/studio-core';
import { MarkerType } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { buildFlowEdges, buildFlowNodes } from './workflow-graph-view';

const WORKFLOW: Workflow = {
  entrypoint: 'assistant',
  nodes: {
    assistant: { type: 'agent', agent: 'assistant' },
    lookup: { type: 'tool', tool: 'lookupRecord' },
  },
  edges: [{ from: 'assistant', to: 'lookup', when: 'needsLookup' }],
};

describe('buildFlowNodes', () => {
  it('creates one React Flow node per workflow node, each with a finite position', () => {
    const nodes = buildFlowNodes(WORKFLOW, new Set());
    expect(nodes).toHaveLength(2);
    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(node.type).toBe('workflowNode');
    }
  });

  it('marks the entrypoint node and carries the real node data through', () => {
    const nodes = buildFlowNodes(WORKFLOW, new Set());
    const assistant = nodes.find((n) => n.id === 'assistant')!;
    const lookup = nodes.find((n) => n.id === 'lookup')!;
    expect(assistant.data.isEntrypoint).toBe(true);
    expect(lookup.data.isEntrypoint).toBe(false);
    expect(assistant.data.node).toEqual(WORKFLOW.nodes.assistant);
  });

  it('marks a node unsafe only when its id is in the unsafe set', () => {
    const nodes = buildFlowNodes(WORKFLOW, new Set(['lookup']));
    const assistant = nodes.find((n) => n.id === 'assistant')!;
    const lookup = nodes.find((n) => n.id === 'lookup')!;
    expect(assistant.data.isUnsafe).toBe(false);
    expect(lookup.data.isUnsafe).toBe(true);
  });
});

describe('buildFlowEdges', () => {
  it('creates one React Flow edge per workflow edge, carrying the real `when` as a label', () => {
    const edges = buildFlowEdges(WORKFLOW);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'assistant',
      target: 'lookup',
      label: 'needsLookup',
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  it('returns an empty array for a workflow with no edges', () => {
    const workflow: Workflow = { entrypoint: 'a', nodes: { a: { type: 'agent', agent: 'a' } } };
    expect(buildFlowEdges(workflow)).toEqual([]);
  });
});
