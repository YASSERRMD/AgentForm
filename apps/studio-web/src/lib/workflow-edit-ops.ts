import type { Workflow, WorkflowNode, WorkflowNodeType } from '@agentform/studio-core';
import { isRecord } from './json-schema-utils';

/** Normalizes an arbitrary `workflows.<id>` resource value (possibly a brand-new, still-empty resource) into a safe, always-renderable `Workflow` draft. */
export function normalizeWorkflow(value: unknown): Workflow {
  if (!isRecord(value)) {
    return { entrypoint: '', nodes: {} };
  }
  return {
    entrypoint: typeof value.entrypoint === 'string' ? value.entrypoint : '',
    nodes: isRecord(value.nodes) ? (value.nodes as Record<string, WorkflowNode>) : {},
    edges: Array.isArray(value.edges) ? (value.edges as Workflow['edges']) : undefined,
  };
}

/**
 * A minimal, schema-shaped starting point for each node type — required
 * fields get an empty placeholder the user fills in via the node editor
 * immediately after adding; live validation shows the gap until then,
 * exactly like an empty required field anywhere else in Studio.
 */
export function minimalNodeOfType(type: WorkflowNodeType): WorkflowNode {
  switch (type) {
    case 'agent':
      return { type, agent: '' };
    case 'tool':
      return { type, tool: '' };
    case 'loop':
      return { type, maxIterations: 1 };
    case 'delay':
      return { type, duration: '1s' };
    case 'event':
      return { type, eventType: '' };
    case 'subworkflow':
      return { type, workflow: '' };
    case 'transform':
    case 'condition':
      return { type, expression: '' };
    case 'router':
    case 'parallel':
    case 'join':
    case 'humanApproval':
    case 'terminate':
      return { type };
    default:
      return type satisfies never;
  }
}

/** Adds a new node of `type` at `nodeId`. No-ops on a blank id or a collision with an existing node id. The very first node added becomes the entrypoint automatically. */
export function addNode(workflow: Workflow, nodeId: string, type: WorkflowNodeType): Workflow {
  const id = nodeId.trim();
  if (!id || workflow.nodes[id]) {
    return workflow;
  }
  return {
    ...workflow,
    entrypoint: workflow.entrypoint || id,
    nodes: { ...workflow.nodes, [id]: minimalNodeOfType(type) },
  };
}

export function updateNode(workflow: Workflow, nodeId: string, nextNode: WorkflowNode): Workflow {
  return { ...workflow, nodes: { ...workflow.nodes, [nodeId]: nextNode } };
}

/** Removes a node and every edge touching it. Callers are responsible for refusing to delete the entrypoint (surfaced as a disabled button, not a silent no-op here). */
export function deleteNode(workflow: Workflow, nodeId: string): Workflow {
  const nextNodes = { ...workflow.nodes };
  delete nextNodes[nodeId];
  const nextEdges = (workflow.edges ?? []).filter(
    (edge) => edge.from !== nodeId && edge.to !== nodeId,
  );
  return { ...workflow, nodes: nextNodes, edges: nextEdges };
}

export function setEntrypoint(workflow: Workflow, nodeId: string): Workflow {
  return { ...workflow, entrypoint: nodeId };
}

export function addWorkflowEdge(workflow: Workflow, from: string, to: string): Workflow {
  return { ...workflow, edges: [...(workflow.edges ?? []), { from, to }] };
}

export function deleteEdge(workflow: Workflow, edgeIndex: number): Workflow {
  return { ...workflow, edges: (workflow.edges ?? []).filter((_, i) => i !== edgeIndex) };
}

export function updateEdgeWhen(workflow: Workflow, edgeIndex: number, when: string): Workflow {
  const trimmed = when.trim();
  const nextEdges = (workflow.edges ?? []).map((edge, i) =>
    i === edgeIndex ? { ...edge, when: trimmed.length > 0 ? trimmed : undefined } : edge,
  );
  return { ...workflow, edges: nextEdges };
}
