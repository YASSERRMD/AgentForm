import type { IRWorkflow } from '@agentform/ir';

function nodeLabel(id: string, type: string): string {
  return `${id} (${type})`;
}

function escapeMermaidLabel(text: string): string {
  return text.replace(/"/g, '#quot;');
}

function escapeDotString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Renders one workflow as a Mermaid `flowchart` (§15.5). The entrypoint
 * node gets a distinct rounded-stadium shape so it's visually obvious
 * where execution starts; every other node is a plain rectangle. Edge
 * labels carry the `when` guard expression when present.
 */
export function renderMermaid(workflowId: string, workflow: IRWorkflow): string {
  const lines = [`flowchart TD`, `  %% workflow: ${workflowId}`];

  for (const [nodeId, node] of workflow.nodes) {
    const label = escapeMermaidLabel(nodeLabel(nodeId, node.type));
    const shape = nodeId === workflow.entrypoint ? `(["${label}"])` : `["${label}"]`;
    lines.push(`  ${nodeId}${shape}`);
  }

  for (const edge of workflow.edges) {
    const suffix = edge.when ? `|"${escapeMermaidLabel(edge.when)}"|` : '';
    lines.push(`  ${edge.from} -->${suffix} ${edge.to}`);
  }

  return `${lines.join('\n')}\n`;
}

/** Renders one workflow as a Graphviz DOT `digraph` (§15.5). */
export function renderDot(workflowId: string, workflow: IRWorkflow): string {
  const lines = [`digraph "${escapeDotString(workflowId)}" {`];

  for (const [nodeId, node] of workflow.nodes) {
    const label = escapeDotString(nodeLabel(nodeId, node.type));
    const shapeAttr = nodeId === workflow.entrypoint ? ', shape=doublecircle' : '';
    lines.push(`  "${escapeDotString(nodeId)}" [label="${label}"${shapeAttr}];`);
  }

  for (const edge of workflow.edges) {
    const labelAttr = edge.when ? ` [label="${escapeDotString(edge.when)}"]` : '';
    lines.push(`  "${escapeDotString(edge.from)}" -> "${escapeDotString(edge.to)}"${labelAttr};`);
  }

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export interface GraphJsonNode {
  readonly id: string;
  readonly type: string;
  readonly isEntrypoint: boolean;
}

export interface GraphJsonEdge {
  readonly from: string;
  readonly to: string;
  readonly when?: string;
}

export interface GraphJson {
  readonly workflow: string;
  readonly entrypoint: string;
  readonly nodes: readonly GraphJsonNode[];
  readonly edges: readonly GraphJsonEdge[];
}

/** Renders one workflow as a plain, framework-agnostic JSON graph (§15.5's third format). */
export function renderGraphJson(workflowId: string, workflow: IRWorkflow): GraphJson {
  return {
    workflow: workflowId,
    entrypoint: workflow.entrypoint,
    nodes: [...workflow.nodes].map(([id, node]) => ({
      id,
      type: node.type,
      isEntrypoint: id === workflow.entrypoint,
    })),
    edges: workflow.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.when ? { when: edge.when } : {}),
    })),
  };
}
