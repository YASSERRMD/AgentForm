import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * Every loop node must have a positive, finite `maxIterations`. The schema
 * already makes this structurally impossible to violate (`loopNodeSchema`
 * requires `z.number().int().positive()`), so in practice this check never
 * fires — it exists as defense in depth against a `PolicyContext` built
 * from data that bypassed schema validation, and as documentation of an
 * invariant this policy pack depends on.
 */
export const af005WorkflowLoopsRequireLimits: PolicyDefinition = {
  id: 'AF005',
  name: 'workflow-loops-require-limits',
  description: 'Reject loop nodes without a positive, finite maxIterations bound.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    for (const [workflowId, workflow] of Object.entries(context.application.spec.workflows)) {
      for (const [nodeId, node] of Object.entries(workflow.nodes)) {
        if (node.type !== 'loop') {
          continue;
        }
        if (Number.isFinite(node.maxIterations) && node.maxIterations > 0) {
          continue;
        }
        findings.push({
          message: `Workflow "${workflowId}" loop node "${nodeId}" has no positive maxIterations bound.`,
          resourceAddress: `spec.workflows.${workflowId}.nodes.${nodeId}`,
          remediation: 'Set maxIterations to a positive integer bounding how many times this loop can run.',
        });
      }
    }
    return findings;
  },
};
