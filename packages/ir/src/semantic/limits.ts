import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { SEMANTIC_DIAGNOSTIC_CODES } from '../codes.js';

export const DEFAULT_MAX_WORKFLOW_NODES = 200;
export const DEFAULT_MAX_WORKFLOW_EDGES = 500;
export const DEFAULT_MAX_EXPRESSION_LENGTH = 1000;

export interface ValidateLimitsOptions {
  readonly maxWorkflowNodes?: number;
  readonly maxWorkflowEdges?: number;
  readonly maxExpressionLength?: number;
}

function error(code: string, message: string, path: readonly (string | number)[]): Diagnostic {
  return { code, severity: 'error', message, path };
}

/**
 * Bounds the size and complexity of a workflow graph (§19 "Maximum
 * workflow nodes", "Maximum graph edges", "Maximum expression
 * complexity") — protection against a document that is structurally
 * valid but pathologically large, which would otherwise make graph
 * algorithms (this package) and any future compiler/executor arbitrarily
 * expensive to run against it. "Expression complexity" is approximated by
 * the raw string length of every `when`/`condition`/`transform`
 * expression, since Agentform has no expression AST to measure real
 * complexity against yet — expression *evaluation* is future-phase scope
 * (§7); only the string a hostile document could pad arbitrarily exists
 * today.
 */
export function validateLimits(
  application: AgenticApplication,
  options: ValidateLimitsOptions = {},
): Diagnostic[] {
  const maxNodes = options.maxWorkflowNodes ?? DEFAULT_MAX_WORKFLOW_NODES;
  const maxEdges = options.maxWorkflowEdges ?? DEFAULT_MAX_WORKFLOW_EDGES;
  const maxExpressionLength = options.maxExpressionLength ?? DEFAULT_MAX_EXPRESSION_LENGTH;
  const diagnostics: Diagnostic[] = [];

  for (const [workflowId, workflow] of Object.entries(application.spec.workflows)) {
    const basePath = ['spec', 'workflows', workflowId] as const;
    const nodeCount = Object.keys(workflow.nodes).length;
    const edges = workflow.edges ?? [];

    if (nodeCount > maxNodes) {
      diagnostics.push(
        error(
          SEMANTIC_DIAGNOSTIC_CODES.MAX_WORKFLOW_NODES_EXCEEDED.code,
          `Workflow "${workflowId}" has ${nodeCount} nodes, exceeding the maximum of ${maxNodes}`,
          [...basePath, 'nodes'],
        ),
      );
    }

    if (edges.length > maxEdges) {
      diagnostics.push(
        error(
          SEMANTIC_DIAGNOSTIC_CODES.MAX_WORKFLOW_EDGES_EXCEEDED.code,
          `Workflow "${workflowId}" has ${edges.length} edges, exceeding the maximum of ${maxEdges}`,
          [...basePath, 'edges'],
        ),
      );
    }

    edges.forEach((edge, index) => {
      if (edge.when && edge.when.length > maxExpressionLength) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.MAX_EXPRESSION_LENGTH_EXCEEDED.code,
            `Workflow "${workflowId}" edge ${index}'s "when" expression is ${edge.when.length} characters, exceeding the maximum of ${maxExpressionLength}`,
            [...basePath, 'edges', index, 'when'],
          ),
        );
      }
    });

    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      const expression =
        node.type === 'condition' || node.type === 'transform' ? node.expression : undefined;
      if (expression && expression.length > maxExpressionLength) {
        diagnostics.push(
          error(
            SEMANTIC_DIAGNOSTIC_CODES.MAX_EXPRESSION_LENGTH_EXCEEDED.code,
            `Workflow "${workflowId}" node "${nodeId}"'s expression is ${expression.length} characters, exceeding the maximum of ${maxExpressionLength}`,
            [...basePath, 'nodes', nodeId, 'expression'],
          ),
        );
      }
    }
  }

  return diagnostics;
}
