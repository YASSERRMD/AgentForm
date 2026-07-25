import type { Workflow, WorkflowNode } from '@agentform/studio-core';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { layoutWorkflowNodes } from './workflow-layout';

export interface WorkflowNodeShapeData extends Record<string, unknown> {
  readonly nodeId: string;
  readonly node: WorkflowNode;
  readonly isEntrypoint: boolean;
  readonly isUnsafe: boolean;
}

export type WorkflowFlowNode = Node<WorkflowNodeShapeData, 'workflowNode'>;

export interface WorkflowEdgeData extends Record<string, unknown> {
  readonly edgeIndex: number;
}

export type WorkflowFlowEdge = Edge<WorkflowEdgeData>;

const DEFAULT_BOX = { width: 190, height: 70 };

/** Builds React Flow nodes for every node in `workflow`, auto-laid-out via dagre — no positions are read from or written back to the spec. */
export function buildFlowNodes(
  workflow: Workflow,
  unsafeNodeIds: ReadonlySet<string>,
): WorkflowFlowNode[] {
  const nodeIds = Object.keys(workflow.nodes);
  const positions = layoutWorkflowNodes(nodeIds, workflow.edges ?? [], {});

  return nodeIds.map((nodeId) => {
    const position = positions[nodeId] ?? { x: 0, y: 0 };
    return {
      id: nodeId,
      type: 'workflowNode',
      position,
      width: DEFAULT_BOX.width,
      height: DEFAULT_BOX.height,
      data: {
        nodeId,
        node: workflow.nodes[nodeId]!,
        isEntrypoint: nodeId === workflow.entrypoint,
        isUnsafe: unsafeNodeIds.has(nodeId),
      },
    };
  });
}

/**
 * Builds React Flow edges for every edge in `workflow`, labeling
 * conditional edges with their real `when` expression. Each edge carries
 * its own real array index in `data.edgeIndex` — `WorkflowEdge` has no
 * stable id in the schema, so the canvas's delete/edit actions need a
 * reliable way back to "which array element is this" that doesn't depend
 * on parsing the generated React Flow edge id string.
 */
export function buildFlowEdges(workflow: Workflow): WorkflowFlowEdge[] {
  return (workflow.edges ?? []).map((edge, index) => ({
    id: `${edge.from}->${edge.to}#${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.when,
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { edgeIndex: index },
  }));
}
