import type { AgenticApplication } from '@agentform/schema';
import { describe, expect, it } from 'vitest';
import { computeDesignContentHash, stampDesignArtifact } from './server.js';
import type { DesignDraft } from './types.js';

const APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'test' },
    models: { primary: { provider: 'openai', model: 'gpt-4' } },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Help.' } },
    },
    workflows: {
      main: {
        entrypoint: 'respond',
        nodes: { respond: { type: 'agent', agent: 'assistant' } },
        edges: [],
      },
    },
  },
};

const DRAFT: DesignDraft = {
  binding: { resourceType: 'agents', resourceId: 'assistant' },
  layout: { input: [{ id: 'f1', type: 'field', widget: 'text' }] },
};

describe('computeDesignContentHash', () => {
  it('is deterministic — the same content produces the same hash every time', () => {
    const fields = {
      binding: { resourceType: 'agents' as const, resourceId: 'assistant' },
      designVersion: '1',
      specVersionTarget: 'sha256:aaa',
      layout: { input: [{ id: 'f1', type: 'field' as const }] },
    };
    expect(computeDesignContentHash(fields)).toBe(computeDesignContentHash({ ...fields }));
  });

  it('matches the sha256: format @agentform/ir uses', () => {
    const hash = computeDesignContentHash({
      binding: { resourceType: 'agents', resourceId: 'a' },
      designVersion: '1',
      specVersionTarget: 'sha256:aaa',
    });
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes when the layout content changes', () => {
    const base = {
      binding: { resourceType: 'agents' as const, resourceId: 'assistant' },
      designVersion: '1',
      specVersionTarget: 'sha256:aaa',
    };
    const hashA = computeDesignContentHash({
      ...base,
      layout: { input: [{ id: 'f1', type: 'field' as const }] },
    });
    const hashB = computeDesignContentHash({
      ...base,
      layout: { input: [{ id: 'f2', type: 'field' as const }] },
    });
    expect(hashA).not.toBe(hashB);
  });
});

describe('stampDesignArtifact', () => {
  it('fills in designVersion, specVersionTarget, and contentHash', () => {
    const stamped = stampDesignArtifact(DRAFT, APPLICATION);
    expect(stamped.designVersion).toBe('1');
    expect(stamped.specVersionTarget).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(stamped.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(stamped.binding).toEqual(DRAFT.binding);
    expect(stamped.layout).toEqual(DRAFT.layout);
  });

  it('produces the same specVersionTarget for the same application, regardless of draft content', () => {
    const otherDraft: DesignDraft = {
      binding: { resourceType: 'workflows', resourceId: 'main' },
      positions: { respond: { x: 1, y: 2 } },
    };
    const a = stampDesignArtifact(DRAFT, APPLICATION);
    const b = stampDesignArtifact(otherDraft, APPLICATION);
    expect(a.specVersionTarget).toBe(b.specVersionTarget);
  });

  it('re-stamping identical input twice is deterministic (round-trip fidelity)', () => {
    const a = stampDesignArtifact(DRAFT, APPLICATION);
    const b = stampDesignArtifact(DRAFT, APPLICATION);
    expect(a).toEqual(b);
  });
});
