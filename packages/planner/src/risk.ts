import type { AgentformIR, IRWorkflow } from '@agentform/ir';
import type { PlanItem, PlanRisk } from './types.js';

const RISK_RANK: Record<PlanRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function escalate(current: PlanRisk, candidate: PlanRisk): PlanRisk {
  return RISK_RANK[candidate] > RISK_RANK[current] ? candidate : current;
}

function isSideEffect(value: unknown, effect: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { sideEffect?: unknown }).sideEffect === effect
  );
}

/**
 * True when `workflow` has a `tool` node calling a `destructive`-sideEffect
 * tool with no incoming edge from a `humanApproval` node — the same
 * structural signal `@agentform/policy`'s `AF004` checks, adapted to the
 * IR's shape. Some overlap between plan-time risk and policy evaluation
 * is expected (they're different pipeline stages answering different
 * questions — "how risky is this change" vs. "is this document allowed
 * at all" — see ADR-0007's note on AF003/AGF3011 for the established
 * precedent of intentional overlap between layers).
 */
function hasUngatedDestructiveTool(workflow: IRWorkflow, ir: AgentformIR): boolean {
  for (const [nodeId, node] of workflow.nodes) {
    if (node.type !== 'tool') {
      continue;
    }
    const tool = ir.tools.get(node.tool);
    if (!tool || !isSideEffect(tool, 'destructive')) {
      continue;
    }
    const gated = workflow.edges.some(
      (edge) => edge.to === nodeId && workflow.nodes.get(edge.from)?.type === 'humanApproval',
    );
    if (!gated) {
      return true;
    }
  }
  return false;
}

/**
 * Classifies one plan item's risk (§9's risk table). Two tiers of
 * precision, both intentional:
 *
 * - **Precise, computed from the desired side alone** (always fully
 *   available, regardless of what's in state): a newly created tool's
 *   `sideEffect` ("new read-only tool: medium", "new write-capable tool:
 *   high"), and a workflow containing an ungated destructive-tool call
 *   ("removal of human approval" reframed as "presence of an ungated
 *   destructive call," since the desired side can't see what was
 *   *removed* — only what's *there*).
 * - **Operation-type baselines**, used wherever a precise rule from §9
 *   would require the resource's *previous* value (a prompt-text change,
 *   a model version bump, an expanded network destination, an increased
 *   cost ceiling, a data-residency change) — `ResourceState` deliberately
 *   stores only content/identity hashes, never raw previous values (§10
 *   "never store raw secret values"), so those specific comparisons
 *   aren't available yet. `UPDATE` defaults to `MEDIUM`, `REPLACE` and
 *   `DELETE` default to `HIGH` — reflecting that *some* unidentified
 *   field changed, or a resource's identity changed, or something is
 *   being removed, all of which warrant more scrutiny than a `NO_OP`
 *   even when the exact cause isn't known yet.
 */
export function classifyRisk(
  item: Pick<PlanItem, 'operation' | 'kind' | 'after'>,
  ir: AgentformIR,
): PlanRisk {
  let risk: PlanRisk = 'LOW';

  switch (item.operation) {
    case 'NO_OP':
    case 'READ':
    case 'IMPORT':
      return 'LOW';
    case 'CREATE':
      risk = 'LOW';
      break;
    case 'UPDATE':
      risk = 'MEDIUM';
      if (item.kind === 'model') {
        risk = escalate(risk, 'HIGH');
      }
      break;
    case 'REPLACE':
      risk = 'HIGH';
      break;
    case 'DELETE':
      risk = item.kind === 'workflow' ? 'CRITICAL' : 'HIGH';
      break;
  }

  if (item.kind === 'tool' && (item.operation === 'CREATE' || item.operation === 'UPDATE')) {
    if (isSideEffect(item.after, 'read')) {
      risk = escalate(risk, 'MEDIUM');
    } else if (isSideEffect(item.after, 'write') || isSideEffect(item.after, 'destructive')) {
      risk = escalate(risk, 'HIGH');
    }
  }

  if (
    item.kind === 'workflow' &&
    (item.operation === 'CREATE' || item.operation === 'UPDATE') &&
    item.after &&
    hasUngatedDestructiveTool(item.after as IRWorkflow, ir)
  ) {
    risk = escalate(risk, 'CRITICAL');
  }

  return risk;
}
