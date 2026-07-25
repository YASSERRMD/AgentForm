import dagre from '@dagrejs/dagre';

export interface LayoutBox {
  readonly width: number;
  readonly height: number;
}

export interface LayoutPosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Neither the IR nor the CLI's mermaid/DOT/JSON graph renderers compute
 * node positions — verified before this file was written; `agentform
 * graph` leaves layout entirely to whatever downstream tool renders the
 * text it emits. The canvas is the first place in this codebase that
 * needs real x/y positions, so it gets its own auto-layout step here.
 * No positions are persisted anywhere (the spec has no field for them,
 * and shouldn't — layout is presentation, not behavior); a persisted
 * `.afdesign.json` layout artifact is explicitly Phase 16's concern
 * (`packages/studio-design`), not this one.
 */
export function layoutWorkflowNodes(
  nodeIds: readonly string[],
  edges: readonly { readonly from: string; readonly to: string }[],
  boxes: Record<string, LayoutBox>,
): Record<string, LayoutPosition> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const nodeId of nodeIds) {
    const box = boxes[nodeId] ?? { width: 180, height: 60 };
    // dagre writes computed x/y/rank/order directly onto the label object
    // it's given rather than cloning it (verified empirically) — spreading
    // here means callers can safely pass the same shared box reference for
    // same-sized nodes without their layout results silently colliding.
    graph.setNode(nodeId, { ...box });
  }
  for (const edge of edges) {
    if (nodeIds.includes(edge.from) && nodeIds.includes(edge.to)) {
      graph.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(graph);

  const positions: Record<string, LayoutPosition> = {};
  for (const nodeId of nodeIds) {
    const label = graph.node(nodeId);
    positions[nodeId] = { x: label.x - label.width / 2, y: label.y - label.height / 2 };
  }
  return positions;
}
