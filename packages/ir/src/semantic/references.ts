import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { SEMANTIC_DIAGNOSTIC_CODES } from '../codes.js';

function error(code: string, message: string, path: readonly (string | number)[]): Diagnostic {
  return { code, severity: 'error', message, path };
}

/** The declared tool name a `tool:` workflow-node value or an agent's `tools[]` entry refers to — a node's `tool` may be a dotted "toolName.operation" reference, but only the base tool name is a declared resource. */
function baseToolName(reference: string): string {
  return reference.split('.', 1)[0] ?? reference;
}

/**
 * Checks every cross-resource reference in the document resolves to a
 * declared resource: an agent's `model`/`tools[]`/`memory.ref`, and a
 * workflow node's `agent`/`tool`. (Workflow-graph-internal references —
 * entrypoint, edges, onError — are `graph.ts`'s job, since they need the
 * whole graph in view, not just one resource at a time.)
 */
export function validateReferences(application: AgenticApplication): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { spec } = application;
  const modelIds = new Set(Object.keys(spec.models));
  const toolIds = new Set(Object.keys(spec.tools ?? {}));
  const agentIds = new Set(Object.keys(spec.agents));
  const memoryIds = new Set(Object.keys(spec.memory ?? {}));

  for (const [agentId, agent] of Object.entries(spec.agents)) {
    if (!modelIds.has(agent.model)) {
      diagnostics.push(
        error(
          SEMANTIC_DIAGNOSTIC_CODES.UNKNOWN_MODEL.code,
          `Agent "${agentId}" references unknown model "${agent.model}"`,
          ['spec', 'agents', agentId, 'model'],
        ),
      );
    }

    (agent.tools ?? []).forEach((toolId, index) => {
      if (!toolIds.has(toolId)) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.UNKNOWN_TOOL.code,
            `Agent "${agentId}" references unknown tool "${toolId}"`,
            ['spec', 'agents', agentId, 'tools', index],
          ),
        );
      }
    });

    if (agent.memory && !memoryIds.has(agent.memory.ref)) {
      diagnostics.push(
        error(
          SEMANTIC_DIAGNOSTIC_CODES.INVALID_MEMORY_REFERENCE.code,
          `Agent "${agentId}" references unknown memory "${agent.memory.ref}"`,
          ['spec', 'agents', agentId, 'memory', 'ref'],
        ),
      );
    }
  }

  for (const [workflowId, workflow] of Object.entries(spec.workflows)) {
    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      const nodePath = ['spec', 'workflows', workflowId, 'nodes', nodeId] as const;

      if (node.type === 'agent' && !agentIds.has(node.agent)) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.UNKNOWN_AGENT.code,
            `Workflow "${workflowId}" node "${nodeId}" references unknown agent "${node.agent}"`,
            [...nodePath, 'agent'],
          ),
        );
      }

      if (node.type === 'tool' && !toolIds.has(baseToolName(node.tool))) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.UNKNOWN_TOOL.code,
            `Workflow "${workflowId}" node "${nodeId}" references unknown tool "${node.tool}"`,
            [...nodePath, 'tool'],
          ),
        );
      }
    }
  }

  return diagnostics;
}
