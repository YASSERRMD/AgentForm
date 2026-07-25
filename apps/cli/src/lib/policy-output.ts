import type { PolicyResult } from '@agentform/policy';

export interface PolicySummary {
  readonly total: number;
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
  readonly skip: number;
}

export function summarizePolicyResults(results: readonly PolicyResult[]): PolicySummary {
  return {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
  };
}

export function formatPolicySummary(summary: PolicySummary): string {
  return `Policy: ${summary.total} evaluated — ${summary.pass} passed, ${summary.warn} warned, ${summary.fail} failed, ${summary.skip} skipped.`;
}
