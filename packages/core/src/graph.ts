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

export interface TopologicalSortResult<NodeId extends string = string> {
  /** Every node that could be placed, in an order where each edge's `from` appears before its `to`. */
  readonly order: readonly NodeId[];
  /** Nodes that could not be placed because they participate in a cycle. Empty for an acyclic graph. A caller that requires a strict order (e.g. the planner ordering resource creation by dependency) should treat a non-empty `cyclic` as an error. */
  readonly cyclic: readonly NodeId[];
}

/**
 * Kahn's algorithm: repeatedly takes a node with no remaining unplaced
 * dependency (in-degree zero) and places it, until none remain. Reading an
 * edge `{ from: dependency, to: dependent }` — as this package's other
 * graph consumers do — `order` is a valid "create in this order" sequence
 * (every dependency before its dependents); its reverse is a valid
 * "delete/tear down in this order" sequence. Deterministic for a given
 * `DirectedGraph`: ties break in `graph.nodes`'s own iteration order.
 */
export function topologicalSort<NodeId extends string>(
  graph: DirectedGraph<NodeId>,
): TopologicalSortResult<NodeId> {
  const inDegree = new Map<NodeId, number>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const adjacencyList = adjacency(graph);
  const queue: NodeId[] = [...graph.nodes].filter((node) => inDegree.get(node) === 0);
  const order: NodeId[] = [];

  while (queue.length > 0) {
    const node = queue.shift() as NodeId;
    order.push(node);
    for (const next of adjacencyList.get(node) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) {
        queue.push(next);
      }
    }
  }

  const placed = new Set(order);
  const cyclic = [...graph.nodes].filter((node) => !placed.has(node));
  return { order, cyclic };
}
