export interface DirectedEdge<NodeId extends string = string> {
  readonly from: NodeId;
  readonly to: NodeId;
}

export interface DirectedGraph<NodeId extends string = string> {
  readonly nodes: ReadonlySet<NodeId>;
  readonly edges: readonly DirectedEdge<NodeId>[];
}

function adjacency<NodeId extends string>(graph: DirectedGraph<NodeId>): Map<NodeId, NodeId[]> {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }
  return adjacency;
}

/** Every node reachable from `start` by following directed edges, including `start` itself. */
export function reachableNodes<NodeId extends string>(
  graph: DirectedGraph<NodeId>,
  start: NodeId,
): ReadonlySet<NodeId> {
  const adjacencyList = adjacency(graph);
  const visited = new Set<NodeId>();
  const queue: NodeId[] = graph.nodes.has(start) ? [start] : [];

  while (queue.length > 0) {
    const current = queue.shift() as NodeId;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of adjacencyList.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return visited;
}

/** Nodes with no outgoing edges — the natural "stop here" points of the graph. */
export function sinkNodes<NodeId extends string>(
  graph: DirectedGraph<NodeId>,
): ReadonlySet<NodeId> {
  const withOutgoing = new Set(graph.edges.map((edge) => edge.from));
  return new Set([...graph.nodes].filter((node) => !withOutgoing.has(node)));
}

/**
 * Finds one cycle reachable from `start`, if any, as the ordered list of
 * node ids forming it (first === last). Returns `undefined` if the graph
 * reachable from `start` is acyclic. Uses the standard three-color DFS
 * (white/gray/black) so it terminates on any finite graph regardless of
 * how many cycles exist — it reports the first one found, which is enough
 * to fail validation; enumerating every cycle isn't needed for that.
 */
export function findCycle<NodeId extends string>(
  graph: DirectedGraph<NodeId>,
  start: NodeId,
): readonly NodeId[] | undefined {
  const adjacencyList = adjacency(graph);
  const state = new Map<NodeId, 'visiting' | 'done'>();
  const stack: NodeId[] = [];

  function visit(node: NodeId): readonly NodeId[] | undefined {
    state.set(node, 'visiting');
    stack.push(node);

    for (const next of adjacencyList.get(node) ?? []) {
      const nextState = state.get(next);
      if (nextState === 'visiting') {
        const cycleStart = stack.indexOf(next);
        return [...stack.slice(cycleStart), next];
      }
      if (nextState !== 'done') {
        const found = visit(next);
        if (found) {
          return found;
        }
      }
    }

    state.set(node, 'done');
    stack.pop();
    return undefined;
  }

  return graph.nodes.has(start) ? visit(start) : undefined;
}
