import { describe, expect, it } from 'vitest';
import type { ResourceState } from '@agentform/state';
import { comparePlan } from './compare.js';
import { collectDesiredResources } from './desired-resources.js';
import { baseIR } from './test-fixtures.js';

function stateFor(address: string, overrides: Partial<ResourceState> = {}): ResourceState {
  const desired = collectDesiredResources(baseIR()).find((r) => r.address === address);
  if (!desired) {
    throw new Error(`no desired resource at ${address}`);
  }
  return {
    address: desired.address,
    kind: desired.kind,
    contentHash: desired.contentHash,
    identityHash: desired.identityHash,
    dependsOn: desired.dependsOn,
    lastAppliedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('comparePlan', () => {
  it('empty state creates every desired resource', () => {
    const items = comparePlan({ ir: baseIR(), currentResourceStates: [] });
    expect(items.every((i) => i.operation === 'CREATE')).toBe(true);
    expect(items.map((i) => i.resourceAddress).sort()).toEqual([
      'agent.assistant',
      'model.primary',
      'workflow.main',
    ]);
  });

  it('identical desired and current state gives NO_OP for every resource', () => {
    const currentResourceStates = collectDesiredResources(baseIR()).map((r) => stateFor(r.address));
    const items = comparePlan({ ir: baseIR(), currentResourceStates });
    expect(items.every((i) => i.operation === 'NO_OP')).toBe(true);
  });

  it('a field change (content hash differs, identity hash the same) produces UPDATE', () => {
    const ir = baseIR();
    const mutatedModels = new Map(ir.models);
    const primary = mutatedModels.get('primary');
    if (!primary) {
      throw new Error('fixture missing primary model');
    }
    mutatedModels.set('primary', { ...primary, version: '2026-01-15' });
    const mutatedIr = { ...ir, models: mutatedModels };

    const currentResourceStates = collectDesiredResources(baseIR()).map((r) => stateFor(r.address));
    const items = comparePlan({ ir: mutatedIr, currentResourceStates });

    const modelItem = items.find((i) => i.resourceAddress === 'model.primary');
    expect(modelItem?.operation).toBe('UPDATE');
  });

  it('a force-replacement field change (identity hash differs) produces REPLACE', () => {
    const ir = baseIR();
    const mutatedModels = new Map(ir.models);
    const primary = mutatedModels.get('primary');
    if (!primary) {
      throw new Error('fixture missing primary model');
    }
    mutatedModels.set('primary', { ...primary, provider: 'azure' });
    const mutatedIr = { ...ir, models: mutatedModels };

    const currentResourceStates = collectDesiredResources(baseIR()).map((r) => stateFor(r.address));
    const items = comparePlan({ ir: mutatedIr, currentResourceStates });

    const modelItem = items.find((i) => i.resourceAddress === 'model.primary');
    expect(modelItem?.operation).toBe('REPLACE');
    expect(modelItem?.replacementReason).toBeDefined();
  });

  it('a resource no longer in the desired specification produces DELETE', () => {
    const currentResourceStates = [
      ...collectDesiredResources(baseIR()).map((r) => stateFor(r.address)),
      stateFor('agent.assistant', { address: 'agent.retired', dependsOn: [] }),
    ];
    const items = comparePlan({ ir: baseIR(), currentResourceStates });

    const deleted = items.find((i) => i.resourceAddress === 'agent.retired');
    expect(deleted?.operation).toBe('DELETE');
  });

  it('dependency order is correct: model before agent before workflow', () => {
    const items = comparePlan({ ir: baseIR(), currentResourceStates: [] });
    const index = (address: string) => items.findIndex((i) => i.resourceAddress === address);
    expect(index('model.primary')).toBeLessThan(index('agent.assistant'));
    expect(index('agent.assistant')).toBeLessThan(index('workflow.main'));
  });

  it('classifies a critical change: deleting a workflow', () => {
    const currentResourceStates = [
      ...collectDesiredResources(baseIR()).map((r) => stateFor(r.address)),
      stateFor('workflow.main', { address: 'workflow.retired', dependsOn: [] }),
    ];
    const items = comparePlan({
      ir: baseIR(),
      currentResourceStates,
    });
    const deleted = items.find((i) => i.resourceAddress === 'workflow.retired');
    expect(deleted?.risk).toBe('CRITICAL');
    expect(deleted?.requiresApproval).toBe(true);
  });

  it('every NO_OP item has LOW risk and does not require approval', () => {
    const currentResourceStates = collectDesiredResources(baseIR()).map((r) => stateFor(r.address));
    const items = comparePlan({ ir: baseIR(), currentResourceStates });
    for (const item of items) {
      expect(item.risk).toBe('LOW');
      expect(item.requiresApproval).toBe(false);
    }
  });
});
