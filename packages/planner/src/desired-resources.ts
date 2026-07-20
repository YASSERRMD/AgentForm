import { computeContentHash, resourceAddress, type AgentformIR, type IROutput } from '@agentform/ir';
import type { ResourceKind } from '@agentform/state';

export interface DesiredResource {
  readonly address: string;
  readonly kind: ResourceKind;
  readonly value: unknown;
  readonly contentHash: string;
  readonly identityHash: string;
  readonly dependsOn: readonly string[];
}

/** The small, kind-specific set of fields whose *change* means a resource's fundamental identity changed, not just its configuration — see `ResourceState.identityHash`'s doc comment in `@agentform/state`. */
function identityFingerprint(kind: ResourceKind, value: unknown): unknown {
  const record = value as Record<string, unknown>;
  switch (kind) {
    case 'tool':
      return { type: record.type };
    case 'model':
      return { provider: record.provider };
    default:
      return {};
  }
}

const OUTPUT_REFERENCE_PATTERN = /^(models|tools|agents|workflows)\.([A-Za-z][A-Za-z0-9_-]*)/;
const PLURAL_TO_KIND: Readonly<Record<string, ResourceKind>> = {
  models: 'model',
  tools: 'tool',
  agents: 'agent',
  workflows: 'workflow',
};

/** Mirrors `@agentform/ir`'s `validateOutputReferences` convention: an output `value` that looks like `<collection>.<id>...` depends on that resource; anything else is an opaque literal with no dependency. */
function outputDependency(output: IROutput): readonly string[] {
  const match = OUTPUT_REFERENCE_PATTERN.exec(output.value);
  if (!match) {
    return [];
  }
  const [, collection, id] = match as unknown as [string, string, string];
  const kind = PLURAL_TO_KIND[collection];
  return kind && id ? [resourceAddress(kind, id)] : [];
}

function makeResource(
  kind: ResourceKind,
  id: string,
  value: unknown,
  dependsOn: readonly string[],
): DesiredResource {
  return {
    address: resourceAddress(kind, id),
    kind,
    value,
    contentHash: computeContentHash(value),
    identityHash: computeContentHash(identityFingerprint(kind, value)),
    dependsOn,
  };
}

/**
 * Flattens an `AgentformIR`'s resource collections into one list, each
 * with its dependencies expressed as resource addresses — the shape
 * `comparePlan` and `topologicalSort` (`@agentform/core`) both need.
 * Dependency extraction covers the primary reference shapes the schema
 * models directly (agent -> model/tools/memory, workflow -> the
 * agents/tools/subworkflows its nodes reference, an agent-type tool ->
 * its agent, an output -> whatever `<collection>.<id>` its value
 * references) — the same reference surface Phase 4's semantic validation
 * already checks, not a speculative superset of it.
 */
export function collectDesiredResources(ir: AgentformIR): readonly DesiredResource[] {
  const resources: DesiredResource[] = [];

  for (const [id, model] of ir.models) {
    resources.push(makeResource('model', id, model, []));
  }

  for (const [id, memory] of ir.memory) {
    resources.push(makeResource('memory', id, memory, []));
  }

  for (const [id, tool] of ir.tools) {
    const dependsOn = tool.type === 'agent' ? [resourceAddress('agent', tool.agent)] : [];
    resources.push(makeResource('tool', id, tool, dependsOn));
  }

  for (const [id, agent] of ir.agents) {
    const dependsOn = [resourceAddress('model', agent.model)];
    for (const toolId of agent.tools ?? []) {
      dependsOn.push(resourceAddress('tool', toolId));
    }
    if (agent.memory) {
      dependsOn.push(resourceAddress('memory', agent.memory.ref));
    }
    resources.push(makeResource('agent', id, agent, dependsOn));
  }

  for (const [id, workflow] of ir.workflows) {
    const dependsOn = new Set<string>();
    for (const node of workflow.nodes.values()) {
      if (node.type === 'agent') {
        dependsOn.add(resourceAddress('agent', node.agent));
      } else if (node.type === 'tool') {
        dependsOn.add(resourceAddress('tool', node.tool));
      } else if (node.type === 'subworkflow') {
        dependsOn.add(resourceAddress('workflow', node.workflow));
      }
    }
    resources.push(makeResource('workflow', id, workflow, [...dependsOn]));
  }

  for (const [id, output] of ir.outputs) {
    resources.push(makeResource('output', id, output, outputDependency(output)));
  }

  return resources;
}
