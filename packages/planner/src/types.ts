import type { ResourceKind } from '@agentform/state';

export type PlanOperation = 'CREATE' | 'UPDATE' | 'REPLACE' | 'DELETE' | 'NO_OP' | 'IMPORT' | 'READ';

export type PlanRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * One field that differs between a resource's previous and desired value.
 * Populated only when both sides of the comparison are actually available
 * — for `CREATE` (no previous value exists at all) and for any comparison
 * against state (which stores only a content hash, never the previous
 * value itself — §10 "never store raw secret values"), `changes` is `[]`
 * and `reasons` carries a textual explanation instead. See the planner
 * ADR for why detailed field-level diffing needs a previous-value
 * snapshot this phase's state model deliberately does not keep.
 */
export interface FieldChange {
  readonly path: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface PlanItem {
  readonly resourceAddress: string;
  readonly kind: ResourceKind;
  readonly operation: PlanOperation;
  readonly risk: PlanRisk;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly changes: readonly FieldChange[];
  readonly reasons: readonly string[];
  readonly requiresApproval: boolean;
  readonly replacementReason?: string;
}

export interface Plan {
  readonly items: readonly PlanItem[];
  readonly createdAt: string;
}
