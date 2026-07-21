import { describe, expect, it } from 'vitest';
import { comparePlan } from './compare.js';
import { createPlanFile, serializePlanFile, verifyPlanFile } from './plan-file.js';
import { baseIR } from './test-fixtures.js';
import type { PlanItem } from './types.js';

const SAMPLE_ITEMS: readonly PlanItem[] = [
  {
    resourceAddress: 'model.primary',
    kind: 'model',
    operation: 'CREATE',
    after: { provider: 'openai', model: 'gpt-5' },
    changes: [],
    reasons: ['resource does not exist in current state'],
    risk: 'LOW',
    requiresApproval: false,
  },
];

describe('createPlanFile / verifyPlanFile round trip', () => {
  it('a freshly created plan file verifies successfully', () => {
    const planFile = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    const result = verifyPlanFile(serializePlanFile(planFile));
    expect(result.valid).toBe(true);
    expect(result.planFile?.items).toEqual(SAMPLE_ITEMS);
  });

  it('rejects a plan file whose items were edited after hashing (tampered)', () => {
    const planFile = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    const serialized = serializePlanFile(planFile);
    const tampered = serialized.replace('"CREATE"', '"DELETE"');

    const result = verifyPlanFile(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tampered');
  });

  it('rejects a plan file whose recorded hash was edited to match tampered content', () => {
    // A naive attacker recomputing SOME hash and pasting it in doesn't
    // help — only the real algorithm over the real content produces a
    // match, and this test doesn't even attempt to fake a matching hash,
    // just confirms an edited hash field alone is exactly as invalid as
    // any other tamper.
    const planFile = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    const serialized = serializePlanFile(planFile);
    const tampered = serialized.replace(planFile.contentHash, 'sha256:0000000000000000');

    const result = verifyPlanFile(tampered);
    expect(result.valid).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const result = verifyPlanFile('{not valid json');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JSON');
  });

  it('rejects valid JSON that does not match the plan file shape', () => {
    const result = verifyPlanFile(JSON.stringify({ hello: 'world' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('shape');
  });

  it('produces a different hash when createdAt differs, even with identical items', () => {
    const a = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    const b = createPlanFile(SAMPLE_ITEMS, '2026-01-02T00:00:00.000Z');
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('produces the same hash for the same items and createdAt', () => {
    const a = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    const b = createPlanFile(SAMPLE_ITEMS, '2026-01-01T00:00:00.000Z');
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('round-trips real comparePlan() output, including a workflow item, without losing data or failing tamper-evidence (regression: a workflow’s Map-typed nodes/edges silently serialized as {} before flattening, causing a false-positive tamper mismatch)', () => {
    const items = comparePlan({ ir: baseIR(), currentResourceStates: [] });
    const planFile = createPlanFile(items, '2026-01-01T00:00:00.000Z');

    const result = verifyPlanFile(serializePlanFile(planFile));
    expect(result.valid).toBe(true);

    const workflowItem = result.planFile?.items.find((item) => item.kind === 'workflow');
    expect(workflowItem).toBeDefined();
    const after = workflowItem?.after as { nodes: Record<string, unknown> } | undefined;
    expect(after?.nodes).toEqual({ assistant: { type: 'agent', agent: 'assistant' } });
  });
});
