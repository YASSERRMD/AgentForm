import type { AgenticApplication } from '@agentform/schema';

export type PolicySeverity = 'error' | 'warning';
export type PolicyResultStatus = 'pass' | 'warn' | 'fail' | 'skip';

/**
 * The deployed-state view a policy check can inspect, structurally typed
 * so `@agentform/policy` stays free of a dependency on `@agentform/state`
 * (the state backends already depend on the schema/diagnostics layer this
 * package sits beside). Callers pass whatever they read from their state
 * backend: `@agentform/state`'s `ApplicationState`, `ResourceState[]`, and
 * `ApplyHistoryEntry[]` all satisfy these fields structurally.
 */
export interface PolicyStateSnapshot {
  readonly application?: unknown;
  readonly resources?: readonly unknown[];
  readonly applyHistory?: readonly unknown[];
}

export interface PolicyContext {
  readonly application: AgenticApplication;
  /**
   * Present only for commands that have opened a state backend (`apply`,
   * `status`, `drift`, `rollback`). `validate`/`plan` run before any state
   * is read, so state-scoped policies (AF014) have nothing to inspect
   * there and report a clean pass rather than a false one.
   */
  readonly state?: PolicyStateSnapshot;
}

/**
 * A single violation a policy's `check` found. Deliberately carries no
 * severity of its own — a policy has exactly one effective severity
 * (its `defaultSeverity`, or a valid override), and every finding it
 * reports is judged by that same severity. A check that finds nothing
 * returns an empty array, which `evaluate.ts` reports as `status: 'pass'`.
 */
export interface PolicyFinding {
  readonly message: string;
  readonly resourceAddress?: string;
  readonly remediation?: string;
}

export type PolicyCheck = (context: PolicyContext) => readonly PolicyFinding[];

export interface PolicyDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultSeverity: PolicySeverity;
  /** A mandatory policy's severity can never be overridden to `skip`, and never downgraded at all — see `evaluate.ts`. */
  readonly mandatory: boolean;
  readonly check: PolicyCheck;
}

/** §16's `PolicyResult` shape exactly — `policyId`/`status`/`message`/`resourceAddress`/`remediation`, plus `sourceLocation` left for a future phase that threads a source map through (schema-level `AgenticApplication` has none today). */
export interface PolicyResult {
  readonly policyId: string;
  readonly policyName: string;
  readonly status: PolicyResultStatus;
  readonly message: string;
  readonly resourceAddress?: string;
  readonly remediation?: string;
}

export interface PolicyOverride {
  /** `skip` disables the policy entirely — rejected outright for a mandatory policy. */
  readonly severity?: PolicySeverity | 'skip';
  /** Required whenever `severity` makes the policy *less* strict than its default (error→warning, error→skip, warning→skip). Not required when tightening (warning→error) or leaving it unchanged. */
  readonly justification?: string;
}

export interface PolicyEngineConfig {
  readonly overrides?: Readonly<Record<string, PolicyOverride>>;
}
