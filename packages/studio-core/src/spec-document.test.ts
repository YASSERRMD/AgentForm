import { describe, expect, it } from 'vitest';
import { buildSpecDocument } from './spec-document.js';

const VALID_SPEC = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'studio-core-fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: { primary: { provider: 'openai', model: 'gpt-5' } },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Be helpful.' } },
    },
    workflows: {
      main: {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      },
    },
  },
};

describe('buildSpecDocument', () => {
  it('returns the validated application and no error diagnostics for a valid spec', () => {
    const result = buildSpecDocument(VALID_SPEC);

    expect(result.application).toBeDefined();
    expect(result.application?.metadata.name).toBe('studio-core-fixture');
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('returns no application and at least one error diagnostic for an invalid spec', () => {
    const result = buildSpecDocument({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
    });

    expect(result.application).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
