import type { AgenticApplication } from '@agentform/schema';

export type PolicySeverity = 'error' | 'warning';
export type PolicyResultStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface PolicyContext {
  readonly application: AgenticApplication;
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
