import { flattenMaps, type DirectedGraph } from '@agentform/core';
import type { AgentformIR } from '@agentform/ir';
import type { ResourceKind, ResourceState } from '@agentform/state';
import { collectDesiredResources, type DesiredResource } from './desired-resources.js';
import { orderPlanItems } from './order.js';
import { classifyRisk } from './risk.js';
import type { PlanItem, PlanOperation } from './types.js';

export interface ComparePlanOptions {
  readonly ir: AgentformIR;
  readonly currentResourceStates: readonly ResourceState[];
}

interface OperationResult {
  readonly operation: PlanOperation;
  readonly replacementReason?: string;
}

function classifyOperation(
  desired: DesiredResource | undefined,
  current: ResourceState | undefined,
): OperationResult {
  if (desired && !current) {
    return { operation: 'CREATE' };
  }
  if (!desired && current) {
    return { operation: 'DELETE' };
  }
  // Both present (the only other reachable case, given callers only ever
  // look up an address that came from one side or the other).
  const d = desired as DesiredResource;
  const c = current as ResourceState;
  if (d.contentHash === c.contentHash) {
    return { operation: 'NO_OP' };
  }
  if (d.identityHash !== c.identityHash) {
    return {
      operation: 'REPLACE',
      replacementReason: `${d.kind}'s identity (e.g. type/provider) changed`,
    };
  }
  return { operation: 'UPDATE' };
}

function reasonsFor(
  operation: PlanOperation,
  desired: DesiredResource | undefined,
  current: ResourceState | undefined,
  replacementReason: string | undefined,
): readonly string[] {
  switch (operation) {
    case 'CREATE':
      return ['resource does not exist in current state'];
    case 'DELETE':
      return ['resource is no longer declared in the desired specification'];
    case 'REPLACE':
      return [replacementReason ?? 'identity changed'];
    case 'UPDATE':
      return [`content hash changed from ${current?.contentHash} to ${desired?.contentHash}`];
    default:
      return ['no change'];
  }
}

/**
 * Compares `options.ir`'s desired resources against `options.currentResourceStates`,
 * producing one `PlanItem` per resource on either side, dependency-ordered
 * (`order.ts`). `IMPORT`/`READ` are part of `PlanOperation`'s type but
 * never produced here, and never will be by this function: Phase 11's
 * `agentform import` (§15.12) recognizes a raw external project and
 * produces a candidate *specification file* for a human to review, never
 * a `PlanItem` — it has no `ResourceState` to compare against (the whole
 * point is that nothing has been tracked yet) and never touches state at
 * all. `IMPORT`/`READ` remain unused by any command as of Phase 11.
 */
export function comparePlan(options: ComparePlanOptions): readonly PlanItem[] {
  const desiredResources = collectDesiredResources(options.ir);
  const desiredByAddress = new Map(desiredResources.map((r) => [r.address, r]));
  const currentByAddress = new Map(options.currentResourceStates.map((r) => [r.address, r]));
  const allAddresses = new Set([...desiredByAddress.keys(), ...currentByAddress.keys()]);

  const items = [...allAddresses].map((address) => {
    const desired = desiredByAddress.get(address);
    const current = currentByAddress.get(address);
    const { operation, replacementReason } = classifyOperation(desired, current);
    const kind = (desired?.kind ?? current?.kind) as ResourceKind;

    const withoutRisk: Omit<PlanItem, 'risk' | 'requiresApproval'> = {
      resourceAddress: address,
      kind,
      operation,
      after: desired?.value,
      changes: [],
      reasons: reasonsFor(operation, desired, current, replacementReason),
      ...(replacementReason ? { replacementReason } : {}),
    };

    const risk = classifyRisk(withoutRisk, options.ir);
    return {
      ...withoutRisk,
      // Flattened only now, *after* `classifyRisk` has used the raw value
      // (a workflow's `.nodes` is a real `Map`, which `classifyRisk`
      // iterates directly) — every public `PlanItem` this function returns
      // must be `JSON.stringify`-safe without data loss, since `agentform
      // plan --json` serializes `after` directly and `createPlanFile`
      // stores it into a `.afplan` file. Leaving a `Map` in `after` doesn't
      // break exact `JSON.stringify(item.after)` output, but it does mean
      // `JSON.stringify` silently drops it to `{}` — this is a real bug
      // that was invisible until an `.afplan` was actually written and
      // read back (`verifyPlanFile` sees `after` values that no longer
      // match what `contentHash` was computed over inside `createPlanFile`,
      // since that hash canonicalizes Maps correctly while a later plain
      // `JSON.stringify` does not).
      after: flattenMaps(withoutRisk.after),
      risk,
      requiresApproval: risk === 'CRITICAL',
    };
  });

  const graph = buildDependencyGraph(desiredResources, options.currentResourceStates);
  return orderPlanItems(items, graph);
}

function buildDependencyGraph(
  desiredResources: readonly DesiredResource[],
  currentResourceStates: readonly ResourceState[],
): DirectedGraph {
  const nodes = new Set<string>();
  const edges: { from: string; to: string }[] = [];

  for (const resource of desiredResources) {
    nodes.add(resource.address);
    for (const dependency of resource.dependsOn) {
      nodes.add(dependency);
      edges.push({ from: dependency, to: resource.address });
    }
  }
  for (const state of currentResourceStates) {
    nodes.add(state.address);
    for (const dependency of state.dependsOn) {
      nodes.add(dependency);
      edges.push({ from: dependency, to: state.address });
    }
  }

  return { nodes, edges };
}
