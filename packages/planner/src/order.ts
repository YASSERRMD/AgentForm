import { topologicalSort, type DirectedGraph } from '@agentform/core';
import type { PlanItem } from './types.js';

/**
 * Orders plan items so that dependency order is always respected:
 * non-delete items (`CREATE`/`UPDATE`/`REPLACE`/`NO_OP`/`IMPORT`/`READ`)
 * come first, in forward topological order (a dependency before whatever
 * depends on it — safe to create/update in this order); `DELETE` items
 * come after, in *reverse* topological order (a dependent before
 * whatever it depends on — safe to delete in this order, since nothing
 * still referencing a resource is deleted before that reference is gone).
 * Batching rather than deeply interleaving the two groups is deliberate:
 * items in unrelated subgraphs have no ordering constraint between them
 * regardless, and the simpler rule is easier to audit in plan output.
 */
export function orderPlanItems(
  items: readonly PlanItem[],
  graph: DirectedGraph,
): readonly PlanItem[] {
  const { order } = topologicalSort(graph);
  const forwardPosition = new Map(order.map((address, index) => [address, index]));

  const forwardGroup = items.filter((item) => item.operation !== 'DELETE');
  const deleteGroup = items.filter((item) => item.operation === 'DELETE');

  const sortedForward = [...forwardGroup].sort(
    (a, b) =>
      (forwardPosition.get(a.resourceAddress) ?? 0) - (forwardPosition.get(b.resourceAddress) ?? 0),
  );
  const sortedDelete = [...deleteGroup].sort(
    (a, b) =>
      (forwardPosition.get(b.resourceAddress) ?? 0) - (forwardPosition.get(a.resourceAddress) ?? 0),
  );

  return [...sortedForward, ...sortedDelete];
}
