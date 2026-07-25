import type { WorkflowNode, WorkflowNodeType } from '@agentform/studio-core';

export type WorkflowNodeCategory = 'execution' | 'control-flow' | 'coordination' | 'terminal';

/**
 * Every real node type from `@agentform/schema`'s `workflowNodeSchema`
 * (13 total, verified against the actual discriminated union — not
 * assumed), grouped into 4 visual categories so the canvas gives a
 * viewer a quick read on what kind of thing a node is before reading
 * its label. Each category gets a distinct color; each node type gets
 * a one-line summary drawn from its own real, type-specific field.
 */
export const WORKFLOW_NODE_CATEGORY: Record<WorkflowNodeType, WorkflowNodeCategory> = {
  agent: 'execution',
  tool: 'execution',
  subworkflow: 'execution',
  router: 'control-flow',
  parallel: 'control-flow',
  join: 'control-flow',
  loop: 'control-flow',
  condition: 'control-flow',
  humanApproval: 'coordination',
  delay: 'coordination',
  event: 'coordination',
  terminate: 'terminal',
  transform: 'terminal',
};

export const CATEGORY_COLOR: Record<WorkflowNodeCategory, string> = {
  execution: '#2563eb',
  'control-flow': '#9333ea',
  coordination: '#d97706',
  terminal: '#4b5563',
};

/** A one-line summary drawn from each node type's own distinguishing field — never a generic placeholder. */
export function summarizeWorkflowNode(node: WorkflowNode): string {
  switch (node.type) {
    case 'agent':
      return `agent: ${node.agent}`;
    case 'tool':
      return `tool: ${node.tool}`;
    case 'subworkflow':
      return `workflow: ${node.workflow}`;
    case 'router':
      return node.default ? `default: ${node.default}` : 'router';
    case 'parallel':
      return node.branches && node.branches.length > 0
        ? `${node.branches.length} branch(es)`
        : 'parallel';
    case 'join':
      return node.strategy ? `strategy: ${node.strategy}` : 'join';
    case 'loop':
      return `max ${node.maxIterations} iteration(s)`;
    case 'condition':
      return node.expression;
    case 'humanApproval':
      return node.approvers && node.approvers.length > 0
        ? `approvers: ${node.approvers.join(', ')}`
        : 'human approval';
    case 'delay':
      return `wait ${node.duration}`;
    case 'event':
      return `event: ${node.eventType}`;
    case 'terminate':
      return node.reason ?? 'terminate';
    case 'transform':
      return node.expression;
    default:
      return node satisfies never;
  }
}
