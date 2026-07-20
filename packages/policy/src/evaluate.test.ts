import { describe, expect, it } from 'vitest';
import { evaluatePolicies, hasPolicyFailures } from './evaluate.js';
import { baseApplication } from './test-fixtures.js';
import type { PolicyContext, PolicyDefinition } from './types.js';

const context: PolicyContext = { application: baseApplication() };

function definePolicy(overrides: Partial<PolicyDefinition> = {}): PolicyDefinition {
  return {
    id: 'AF999',
    name: 'test-policy',
    description: 'A fixture policy for evaluate.ts unit tests.',
    defaultSeverity: 'error',
    mandatory: false,
    check: () => [],
    ...overrides,
  };
}

describe('evaluatePolicies', () => {
  it('reports pass when a policy finds no violations', () => {
    const { results, diagnostics } = evaluatePolicies([definePolicy()], context);
    expect(diagnostics).toEqual([]);
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'pass', message: 'No violations found.' },
    ]);
  });

  it('reports one fail result per finding when the effective severity is error', () => {
    const policy = definePolicy({
      check: () => [
        { message: 'first violation', resourceAddress: 'agents.a' },
        { message: 'second violation', resourceAddress: 'agents.b' },
      ],
    });
    const { results } = evaluatePolicies([policy], context);
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'fail', message: 'first violation', resourceAddress: 'agents.a' },
      { policyId: 'AF999', policyName: 'test-policy', status: 'fail', message: 'second violation', resourceAddress: 'agents.b' },
    ]);
  });

  it('reports warn instead of fail when the policy defaults to warning severity', () => {
    const policy = definePolicy({
      defaultSeverity: 'warning',
      check: () => [{ message: 'a soft violation' }],
    });
    const { results } = evaluatePolicies([policy], context);
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'warn', message: 'a soft violation' },
    ]);
  });

  it('does not run check() for a policy overridden to skip', () => {
    let checkRan = false;
    const policy = definePolicy({
      check: () => {
        checkRan = true;
        return [];
      },
    });
    const { results } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'skip', justification: 'not applicable to this project' } },
    });
    expect(checkRan).toBe(false);
    expect(results).toEqual([
      {
        policyId: 'AF999',
        policyName: 'test-policy',
        status: 'skip',
        message: 'Skipped by configuration override (not applicable to this project).',
      },
    ]);
  });

  it('rejects an override on a mandatory policy and keeps its default severity', () => {
    const policy = definePolicy({
      mandatory: true,
      defaultSeverity: 'error',
      check: () => [{ message: 'must not be bypassed' }],
    });
    const { results, diagnostics } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'skip', justification: 'we do not care' } },
    });
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'fail', message: 'must not be bypassed' },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF4001');
  });

  it('rejects a severity downgrade without a justification and keeps the default severity', () => {
    const policy = definePolicy({
      defaultSeverity: 'error',
      check: () => [{ message: 'still enforced' }],
    });
    const { results, diagnostics } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'warning' } },
    });
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'fail', message: 'still enforced' },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF4002');
  });

  it('rejects a severity downgrade when the justification is blank', () => {
    const policy = definePolicy({ defaultSeverity: 'error' });
    const { diagnostics } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'warning', justification: '   ' } },
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['AGF4002']);
  });

  it('accepts a severity downgrade when a non-empty justification is given', () => {
    const policy = definePolicy({
      defaultSeverity: 'error',
      check: () => [{ message: 'downgraded violation' }],
    });
    const { results, diagnostics } = evaluatePolicies([policy], context, {
      overrides: {
        AF999: { severity: 'warning', justification: 'accepted risk, tracked in TICKET-123' },
      },
    });
    expect(diagnostics).toEqual([]);
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'warn', message: 'downgraded violation' },
    ]);
  });

  it('allows tightening severity (warning to error) without requiring a justification', () => {
    const policy = definePolicy({
      defaultSeverity: 'warning',
      check: () => [{ message: 'now stricter' }],
    });
    const { results, diagnostics } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'error' } },
    });
    expect(diagnostics).toEqual([]);
    expect(results).toEqual([
      { policyId: 'AF999', policyName: 'test-policy', status: 'fail', message: 'now stricter' },
    ]);
  });

  it('flags an override that references an unknown policy ID', () => {
    const { diagnostics } = evaluatePolicies([definePolicy()], context, {
      overrides: { AF000: { severity: 'skip', justification: 'typo target' } },
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['AGF4003']);
  });

  it('treats an override matching the existing default severity as a no-op, even for mandatory policies', () => {
    const policy = definePolicy({ mandatory: true, defaultSeverity: 'error' });
    const { diagnostics } = evaluatePolicies([policy], context, {
      overrides: { AF999: { severity: 'error' } },
    });
    expect(diagnostics).toEqual([]);
  });
});

describe('hasPolicyFailures', () => {
  it('is true when at least one result failed', () => {
    expect(
      hasPolicyFailures([
        { policyId: 'AF001', policyName: 'x', status: 'pass', message: '' },
        { policyId: 'AF002', policyName: 'y', status: 'fail', message: '' },
      ]),
    ).toBe(true);
  });

  it('is false when results are only pass, warn, or skip', () => {
    expect(
      hasPolicyFailures([
        { policyId: 'AF001', policyName: 'x', status: 'pass', message: '' },
        { policyId: 'AF002', policyName: 'y', status: 'warn', message: '' },
        { policyId: 'AF003', policyName: 'z', status: 'skip', message: '' },
      ]),
    ).toBe(false);
  });
});
