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

/** Builds React Flow edges for every edge in `workflow`, labeling conditional edges with their real `when` expression. */
export function buildFlowEdges(workflow: Workflow): Edge[] {
  return (workflow.edges ?? []).map((edge, index) => ({
    id: `${edge.from}->${edge.to}#${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.when,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}
