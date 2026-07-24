import { describe, expect, it } from 'vitest';
import type { AgenticApplication } from '@agentform/schema';
import { applyPatch, type SpecPatch } from './patch.js';

const DOCUMENT = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: {},
    agents: {},
    workflows: {},
  },
} as unknown as AgenticApplication;

describe('applyPatch', () => {
  it('round-trips a document unchanged when given an empty patch', () => {
    const patch: SpecPatch = [];

    const result = applyPatch(DOCUMENT, patch);

    expect(result).toEqual(DOCUMENT);
  });

  it('replaces a nested field without mutating the source document', () => {
    const patch: SpecPatch = [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }];

    const result = applyPatch(DOCUMENT, patch);

    expect(result.metadata.version).toBe('2.0.0');
    expect(DOCUMENT.metadata.version).toBe('1.0.0');
  });

  it('removes a field without mutating the source document', () => {
    const withDescription = {
      ...DOCUMENT,
      metadata: { ...DOCUMENT.metadata, description: 'temporary' },
    } as unknown as AgenticApplication;
    const patch: SpecPatch = [{ op: 'remove', path: ['metadata', 'description'] }];

    const result = applyPatch(withDescription, patch);

    expect('description' in result.metadata).toBe(false);
    expect(withDescription.metadata.description).toBe('temporary');
  });
});
