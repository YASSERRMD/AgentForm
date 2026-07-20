import { findCycle, type DirectedGraph } from '@agentform/core';
import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { SEMANTIC_DIAGNOSTIC_CODES } from '../codes.js';

function error(code: string, message: string, path: readonly (string | number)[]): Diagnostic {
  return { code, severity: 'error', message, path };
}

/**
 * Validates `subworkflow` node `workflow` references: each must name a
 * declared workflow (`INVALID_SUBWORKFLOW`), and the workflow-to-workflow
 * reference graph they form must be acyclic (`CIRCULAR_SUBWORKFLOW`) —
 * workflow A calling B calling A would recurse forever at runtime.
 */
export function validateSubworkflows(application: AgenticApplication): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { workflows } = application.spec;
  const workflowIds = new Set(Object.keys(workflows));
  const referenceEdges: { from: string; to: string }[] = [];

  for (const [workflowId, workflow] of Object.entries(workflows)) {
    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      if (node.type !== 'subworkflow') {
        continue;
      }

      if (!workflowIds.has(node.workflow)) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.INVALID_SUBWORKFLOW.code,
            `Workflow "${workflowId}" node "${nodeId}" references unknown workflow "${node.workflow}"`,
            ['spec', 'workflows', workflowId, 'nodes', nodeId, 'workflow'],
          ),
        );
        continue;
      }

      referenceEdges.push({ from: workflowId, to: node.workflow });
    }
  }

  if (diagnostics.length > 0) {
    return diagnostics;
  }

  const referenceGraph: DirectedGraph = { nodes: workflowIds, edges: referenceEdges };
  const seen = new Set<string>();
  for (const workflowId of workflowIds) {
    if (seen.has(workflowId)) {
      continue;
    }
    const cycle = findCycle(referenceGraph, workflowId);
    if (cycle) {
      cycle.forEach((id) => seen.add(id));
      diagnostics.push(
        error(
          SEMANTIC_DIAGNOSTIC_CODES.CIRCULAR_SUBWORKFLOW.code,
          `Circular subworkflow reference: ${cycle.join(' -> ')}`,
          ['spec', 'workflows', workflowId],
        ),
      );
    } else {
      seen.add(workflowId);
    }
  }

  return diagnostics;
}
