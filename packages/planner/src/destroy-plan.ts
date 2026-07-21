import type { ResourceState } from '@agentform/state';
import { orderPlanItems } from './order.js';
import type { PlanItem, PlanRisk } from './types.js';

/**
 * Builds a destroy plan: every currently-tracked resource becomes a DELETE
 * item, independent of whatever the current specification (if any, and
 * even if it's currently invalid or missing) declares — tearing down
 * exactly what state says is deployed, the same way `terraform destroy`
 * only needs state, not a valid configuration. Risk mirrors `classifyRisk`'s
 * own DELETE rule (`risk.ts`) but is reimplemented rather than shared,
 * since that function requires a full `AgentformIR` that a destroy plan
 * has no other reason to load. Ordered in strict reverse-dependency order
 * (a dependent, e.g. a workflow, destroyed before whatever it depends on,
 * e.g. the agents it references) via the same `orderPlanItems` rule
 * `comparePlan` uses for its own DELETE group.
 */
export function planDestroy(currentResourceStates: readonly ResourceState[]): readonly PlanItem[] {
  const items: PlanItem[] = currentResourceStates.map((state) => {
    const risk: PlanRisk = state.kind === 'workflow' ? 'CRITICAL' : 'HIGH';
    return {
      resourceAddress: state.address,
      kind: state.kind,
      operation: 'DELETE',
      after: undefined,
      changes: [],
      reasons: ['agentform destroy removes every tracked resource'],
      risk,
      requiresApproval: risk === 'CRITICAL',
    };
  });

  const nodes = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  for (const state of currentResourceStates) {
    nodes.add(state.address);
    for (const dependency of state.dependsOn) {
      nodes.add(dependency);
      edges.push({ from: dependency, to: state.address });
    }
  }

  return orderPlanItems(items, { nodes, edges });
}
