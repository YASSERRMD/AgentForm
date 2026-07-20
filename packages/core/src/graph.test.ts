import { describe, expect, it } from 'vitest';
import {
  findCycle,
  reachableNodes,
  sinkNodes,
  topologicalSort,
  type DirectedGraph,
} from './graph.js';

describe('reachableNodes', () => {
  it('finds every node reachable from the start, including itself', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c', 'd']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    };
    expect(reachableNodes(graph, 'a')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('does not include nodes only reachable via incoming edges', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'unreachable']),
      edges: [{ from: 'a', to: 'b' }],
    };
    expect(reachableNodes(graph, 'a').has('unreachable')).toBe(false);
  });

  it('returns just the start node when it has no outgoing edges', () => {
    const graph: DirectedGraph = { nodes: new Set(['a']), edges: [] };
    expect(reachableNodes(graph, 'a')).toEqual(new Set(['a']));
  });

  it('handles a cycle without looping forever', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    expect(reachableNodes(graph, 'a')).toEqual(new Set(['a', 'b']));
  });
});

describe('sinkNodes', () => {
  it('finds nodes with no outgoing edges', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c']),
      edges: [{ from: 'a', to: 'b' }],
    };
    expect(sinkNodes(graph)).toEqual(new Set(['b', 'c']));
  });

  it('returns every node when there are no edges', () => {
    const graph: DirectedGraph = { nodes: new Set(['a', 'b']), edges: [] };
    expect(sinkNodes(graph)).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set when every node has an outgoing edge', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    expect(sinkNodes(graph)).toEqual(new Set());
  });
});

describe('findCycle', () => {
  it('returns undefined for an acyclic graph', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    };
    expect(findCycle(graph, 'a')).toBeUndefined();
  });

  it('finds a direct cycle', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    expect(findCycle(graph, 'a')).toEqual(['a', 'b', 'a']);
  });

  it('finds an indirect cycle several nodes deep', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c', 'd']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'b' },
      ],
    };
    expect(findCycle(graph, 'a')).toEqual(['b', 'c', 'd', 'b']);
  });

  it('ignores a self-loop-free branch and still finds a cycle on another branch', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c', 'd']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'c' },
      ],
    };
    expect(findCycle(graph, 'a')).toEqual(['c', 'd', 'c']);
  });

  it('returns undefined when start is not in the graph', () => {
    const graph: DirectedGraph = { nodes: new Set(['a']), edges: [] };
    expect(findCycle(graph, 'missing')).toBeUndefined();
  });
});

describe('topologicalSort', () => {
  it('orders a simple dependency chain with the dependency first', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model', 'agent', 'workflow']),
      edges: [
        { from: 'model', to: 'agent' },
        { from: 'agent', to: 'workflow' },
      ],
    };
    const result = topologicalSort(graph);
    expect(result.cyclic).toEqual([]);
    expect(result.order).toEqual(['model', 'agent', 'workflow']);
  });

  it('places every independent node when there are no edges', () => {
    const graph: DirectedGraph = { nodes: new Set(['a', 'b', 'c']), edges: [] };
    const result = topologicalSort(graph);
    expect(result.cyclic).toEqual([]);
    expect(result.order).toHaveLength(3);
    expect(new Set(result.order)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('respects a diamond dependency shape', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model', 'toolA', 'toolB', 'agent']),
      edges: [
        { from: 'model', to: 'toolA' },
        { from: 'model', to: 'toolB' },
        { from: 'toolA', to: 'agent' },
        { from: 'toolB', to: 'agent' },
      ],
    };
    const result = topologicalSort(graph);
    expect(result.cyclic).toEqual([]);
    const index = (id: string) => result.order.indexOf(id);
    expect(index('model')).toBeLessThan(index('toolA'));
    expect(index('model')).toBeLessThan(index('toolB'));
    expect(index('toolA')).toBeLessThan(index('agent'));
    expect(index('toolB')).toBeLessThan(index('agent'));
  });

  it('reports every node in a cycle as unplaceable, leaving unrelated nodes ordered', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'independent']),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    const result = topologicalSort(graph);
    expect(result.order).toEqual(['independent']);
    expect(new Set(result.cyclic)).toEqual(new Set(['a', 'b']));
  });

  it('is deterministic for the same graph across repeated calls', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['a', 'b', 'c', 'd']),
      edges: [
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
      ],
    };
    expect(topologicalSort(graph).order).toEqual(topologicalSort(graph).order);
  });
});
