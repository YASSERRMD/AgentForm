import { describe, expect, it } from 'vitest';
import { af014StateMustNotContainSecrets } from './af014-state-must-not-contain-secrets.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

const AWS_KEY = 'AKIAABCDEFGHIJKLMNOP';

describe('AF014 state-must-not-contain-secrets', () => {
  it('is registered as mandatory so it cannot be silently disabled', () => {
    expect(af014StateMustNotContainSecrets.mandatory).toBe(true);
  });

  it('passes when the caller supplied no state — validate/plan run before any is read', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af014StateMustNotContainSecrets.check(context)).toEqual([]);
  });

  it('passes a hash-only state snapshot', () => {
    const context: PolicyContext = {
      application: withApplication(() => {}),
      state: {
        application: {
          applicationName: 'support-bot',
          environment: 'development',
          specificationHash: 'a'.repeat(64),
          irHash: 'b'.repeat(64),
          deploymentIdentifiers: { langgraph: 'deployment-1' },
        },
        resources: [{ address: 'agent.assistant', kind: 'agent', contentHash: 'c'.repeat(64) }],
        applyHistory: [{ id: '1', status: 'succeeded', summary: '3 resources applied' }],
      },
    };
    expect(af014StateMustNotContainSecrets.check(context)).toEqual([]);
  });

  it('detects a credential written into a deployment identifier', () => {
    const findings = af014StateMustNotContainSecrets.check({
      application: withApplication(() => {}),
      state: {
        application: { deploymentIdentifiers: { langgraph: AWS_KEY } },
      },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('AWS access key ID');
    expect(findings[0]?.resourceAddress).toBe('state.application.deploymentIdentifiers.langgraph');
  });

  it('detects a credential in an apply-history summary', () => {
    const findings = af014StateMustNotContainSecrets.check({
      application: withApplication(() => {}),
      state: { applyHistory: [{ id: '1', summary: `deployed with ${AWS_KEY}` }] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('state.applyHistory.0.summary');
  });

  it('never echoes the raw secret value in the finding message', () => {
    const findings = af014StateMustNotContainSecrets.check({
      application: withApplication(() => {}),
      state: { application: { deploymentIdentifiers: { langgraph: AWS_KEY } } },
    });
    expect(findings[0]?.message).not.toContain(AWS_KEY);
  });
});
