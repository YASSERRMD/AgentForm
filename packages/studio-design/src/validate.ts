import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { DESIGN_DIAGNOSTIC_CODES } from './codes.js';
import type { DesignArtifact, LayoutNode } from './types.js';

function error(code: string, message: string, path: readonly (string | number)[]): Diagnostic {
  return { code, severity: 'error', message, path };
}

function collectFieldPaths(nodes: readonly LayoutNode[] | undefined): string[] {
  if (!nodes) {
    return [];
  }
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'field' && node.fieldPath !== undefined) {
      paths.push(node.fieldPath);
    }
    paths.push(...collectFieldPaths(node.children));
  }
  return paths;
}

function schemaPropertyKeys(schemaValue: unknown): Set<string> | null {
  if (
    schemaValue === null ||
    typeof schemaValue !== 'object' ||
    !('properties' in schemaValue) ||
    schemaValue.properties === null ||
    typeof schemaValue.properties !== 'object'
  ) {
    return null;
  }
  return new Set(Object.keys(schemaValue.properties));
}

/**
 * Validates a design artifact against the spec it targets. The only two
 * concerns are referential integrity (does everything this design points
 * at actually exist) and subject-shape consistency (does this design carry
 * only the kind of layout data its binding's resource type expects) —
 * design artifacts never get to assert anything about control flow,
 * permissions, or policy, so there is nothing else here to check.
 */
export function validateDesignArtifact(
  design: DesignArtifact,
  application: AgenticApplication,
): Diagnostic[] {
  const { resourceType, resourceId } = design.binding;

  if (resourceType === 'agents') {
    if (design.positions !== undefined) {
      return [
        error(
          DESIGN_DIAGNOSTIC_CODES.SUBJECT_SHAPE_MISMATCH.code,
          `Design bound to agent "${resourceId}" carries workflow canvas positions`,
          ['binding'],
        ),
      ];
    }
  } else if (design.layout !== undefined) {
    return [
      error(
        DESIGN_DIAGNOSTIC_CODES.SUBJECT_SHAPE_MISMATCH.code,
        `Design bound to workflow "${resourceId}" carries a form layout tree`,
        ['binding'],
      ),
    ];
  }

  const collection = application.spec[resourceType] as Record<string, unknown> | undefined;
  if (!collection || !(resourceId in collection)) {
    return [
      error(
        DESIGN_DIAGNOSTIC_CODES.DANGLING_RESOURCE_BINDING.code,
        `Design references ${resourceType.slice(0, -1)} "${resourceId}", which does not exist in the spec`,
        ['binding', 'resourceId'],
      ),
    ];
  }

  const diagnostics: Diagnostic[] = [];

  if (resourceType === 'agents' && design.layout) {
    const agent = collection[resourceId] as { inputSchema?: unknown; outputSchema?: unknown };
    const inputKeys = schemaPropertyKeys(agent.inputSchema);
    const outputKeys = schemaPropertyKeys(agent.outputSchema);

    for (const fieldPath of collectFieldPaths(design.layout.input)) {
      if (inputKeys && !inputKeys.has(fieldPath)) {
        diagnostics.push(
          error(
            DESIGN_DIAGNOSTIC_CODES.DANGLING_FIELD_PATH.code,
            `Form layout references input field "${fieldPath}", which is not declared in agent "${resourceId}"'s inputSchema`,
            ['layout', 'input'],
          ),
        );
      }
    }
    for (const fieldPath of collectFieldPaths(design.layout.output)) {
      if (outputKeys && !outputKeys.has(fieldPath)) {
        diagnostics.push(
          error(
            DESIGN_DIAGNOSTIC_CODES.DANGLING_FIELD_PATH.code,
            `Form layout references output field "${fieldPath}", which is not declared in agent "${resourceId}"'s outputSchema`,
            ['layout', 'output'],
          ),
        );
      }
    }
  }

  if (resourceType === 'workflows' && design.positions) {
    const workflow = collection[resourceId] as { nodes: Record<string, unknown> };
    for (const nodeId of Object.keys(design.positions)) {
      if (!(nodeId in workflow.nodes)) {
        diagnostics.push(
          error(
            DESIGN_DIAGNOSTIC_CODES.DANGLING_POSITION_NODE.code,
            `Canvas position references node "${nodeId}", which does not exist in workflow "${resourceId}"`,
            ['positions', nodeId],
          ),
        );
      }
    }
  }

  return diagnostics;
}
