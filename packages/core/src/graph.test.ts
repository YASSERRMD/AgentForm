import { describe, expect, it } from 'vitest';
import { findCycle, reachableNodes, sinkNodes, type DirectedGraph } from './graph.js';

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
