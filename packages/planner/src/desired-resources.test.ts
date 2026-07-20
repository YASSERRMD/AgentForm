import { describe, expect, it } from 'vitest';
import { collectDesiredResources } from './desired-resources.js';
import { baseIR } from './test-fixtures.js';

describe('collectDesiredResources', () => {
  it('extracts one resource per model/agent/workflow in the fixture', () => {
    const resources = collectDesiredResources(baseIR());
    const addresses = resources.map((r) => r.address).sort();
    expect(addresses).toEqual(['agent.assistant', 'model.primary', 'workflow.main']);
  });

  it("computes an agent's dependencies as its model", () => {
    const resources = collectDesiredResources(baseIR());
    const agent = resources.find((r) => r.address === 'agent.assistant');
    expect(agent?.dependsOn).toEqual(['model.primary']);
  });

  it("computes a workflow's dependencies as the agents its nodes reference", () => {
    const resources = collectDesiredResources(baseIR());
    const workflow = resources.find((r) => r.address === 'workflow.main');
    expect(workflow?.dependsOn).toEqual(['agent.assistant']);
  });

  it('gives every resource a stable content hash and identity hash', () => {
    const resources = collectDesiredResources(baseIR());
    for (const resource of resources) {
      expect(resource.contentHash).toMatch(/^sha256:/);
      expect(resource.identityHash).toMatch(/^sha256:/);
    }
  });

  it('produces the same content hash across two builds of the same fixture', () => {
    const a = collectDesiredResources(baseIR());
    const b = collectDesiredResources(baseIR());
    expect(a.map((r) => r.contentHash)).toEqual(b.map((r) => r.contentHash));
  });

  it("a model's identity hash changes when its provider changes", () => {
    const ir = baseIR();
    const resources = collectDesiredResources(ir);
    const before = resources.find((r) => r.address === 'model.primary')?.identityHash;

    const mutatedModels = new Map(ir.models);
    mutatedModels.set('primary', { ...mutatedModels.get('primary')!, provider: 'azure' });
    const mutatedIr = { ...ir, models: mutatedModels };
    const after = collectDesiredResources(mutatedIr).find(
      (r) => r.address === 'model.primary',
    )?.identityHash;

    expect(after).not.toBe(before);
  });

  it("a model's identity hash stays the same when only its version changes", () => {
    const ir = baseIR();
    const resources = collectDesiredResources(ir);
    const before = resources.find((r) => r.address === 'model.primary')?.identityHash;

    const mutatedModels = new Map(ir.models);
    mutatedModels.set('primary', { ...mutatedModels.get('primary')!, version: '2026-01-01' });
    const mutatedIr = { ...ir, models: mutatedModels };
    const after = collectDesiredResources(mutatedIr).find(
      (r) => r.address === 'model.primary',
    )?.identityHash;

    expect(after).toBe(before);
  });
});
