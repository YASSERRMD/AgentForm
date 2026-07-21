import { describe, expect, it } from 'vitest';
import type { ResourceState } from '@agentform/state';
import { planDestroy } from './destroy-plan.js';

function state(
  overrides: Partial<ResourceState> & Pick<ResourceState, 'address' | 'kind'>,
): ResourceState {
  return {
    contentHash: 'hash',
    identityHash: 'identity',
    dependsOn: [],
    lastAppliedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('planDestroy', () => {
  it('returns an empty plan for no tracked resources', () => {
    expect(planDestroy([])).toEqual([]);
  });

  it('marks every tracked resource as a DELETE', () => {
    const items = planDestroy([
      state({ address: 'model.primary', kind: 'model' }),
      state({ address: 'agent.assistant', kind: 'agent' }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.operation === 'DELETE')).toBe(true);
    expect(items.every((item) => item.after === undefined)).toBe(true);
  });

  it('classifies a workflow delete as CRITICAL and requiring approval', () => {
    const [item] = planDestroy([state({ address: 'workflow.main', kind: 'workflow' })]);
    expect(item?.risk).toBe('CRITICAL');
    expect(item?.requiresApproval).toBe(true);
  });

  it('classifies a non-workflow delete as HIGH and not requiring approval', () => {
    const [item] = planDestroy([state({ address: 'model.primary', kind: 'model' })]);
    expect(item?.risk).toBe('HIGH');
    expect(item?.requiresApproval).toBe(false);
  });

  it('orders destruction in reverse dependency order (dependent before dependency)', () => {
    const items = planDestroy([
      state({ address: 'model.primary', kind: 'model', dependsOn: [] }),
      state({ address: 'agent.assistant', kind: 'agent', dependsOn: ['model.primary'] }),
      state({ address: 'workflow.main', kind: 'workflow', dependsOn: ['agent.assistant'] }),
    ]);
    expect(items.map((item) => item.resourceAddress)).toEqual([
      'workflow.main',
      'agent.assistant',
      'model.primary',
    ]);
  });
});
