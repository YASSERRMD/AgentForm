import type { Tool, Workflow } from '@agentform/schema';

/**
 * A `tool` node in `workflow` that calls a `destructive`-sideEffect tool
 * without an incoming edge from a `humanApproval` node — i.e. a real,
 * unsafe configuration, not a heuristic. This is the same structural
 * signal `@agentform/policy`'s `AF004` enforces server-side on every
 * saved spec; this function ports that exact check to run client-side,
 * against one in-memory draft workflow, so the canvas can warn *before*
 * a patch is even sent — AF004 remains the sole authority that actually
 * blocks a save, this is strictly an earlier, optimistic echo of it.
 *
 * Deliberately NOT `@agentform/planner`'s `classifyRisk`/`PlanRisk` — that
 * classifies a resource's operation (CREATE/UPDATE/REPLACE/DELETE) against
 * previously-*deployed* state, a concept Studio has no access to (it only
 * ever reads/writes the source spec, never `@agentform/state`). Reusing
 * that vocabulary here would conflate two genuinely different questions:
 * "is this deploy risky relative to what's live" vs. "is this workflow's
 * current shape unsafe on its own terms."
 */
export function findUngatedDestructiveToolNodes(
  workflow: Workflow,
  tools: Record<string, Tool>,
): readonly string[] {
  const edges = workflow.edges ?? [];
  const unsafeNodeIds: string[] = [];

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
    if (!gatedByApproval) {
      unsafeNodeIds.push(nodeId);
    }
  }

  return unsafeNodeIds;
}
