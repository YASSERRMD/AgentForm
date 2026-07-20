import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * A workflow `tool` node that calls a `destructive` tool must have an
 * incoming edge from a `humanApproval` node — i.e. a human has to sign off
 * immediately before the destructive action runs. Checked structurally
 * over the schema-level workflow graph (nodes + edges), not the IR, since
 * PolicyContext only carries the validated `AgenticApplication`.
 */
export const af004CriticalActionsRequireHumanApproval: PolicyDefinition = {
  id: 'AF004',
  name: 'critical-actions-require-human-approval',
  description:
    'Reject destructive tool calls that are not gated by a preceding human approval node.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};

    for (const [workflowId, workflow] of Object.entries(context.application.spec.workflows)) {
      const edges = workflow.edges ?? [];

      for (const [nodeId, node] of Object.entries(workflow.nodes)) {
        if (node.type !== 'tool') {
          continue;
        }
        const tool = tools[node.tool];
        if (!tool || tool.sideEffect !== 'destructive') {
          continue;
        }
        const gatedByApproval = edges.some(
          (edge) => edge.to === nodeId && workflow.nodes[edge.from]?.type === 'humanApproval',
        );
        if (gatedByApproval) {
          continue;
        }
        findings.push({
          message: `Workflow "${workflowId}" node "${nodeId}" calls destructive tool "${node.tool}" without a preceding humanApproval node.`,
          resourceAddress: `spec.workflows.${workflowId}.nodes.${nodeId}`,
          remediation:
            'Add a humanApproval node with an edge into this node before the destructive tool runs.',
        });
      }
    }
    return findings;
  },
};
