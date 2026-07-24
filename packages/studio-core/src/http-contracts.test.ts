import { describe, expect, it } from 'vitest';
import { buildSpecDocument } from './spec-document.js';
import { specDocumentResponseSchema } from './http-contracts.js';

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

describe('specDocumentResponseSchema', () => {
  it('accepts a real buildSpecDocument output for a valid spec', () => {
    const document = buildSpecDocument(VALID_SPEC);

    expect(() => specDocumentResponseSchema.parse(document)).not.toThrow();
  });

  it('accepts a real buildSpecDocument output for an invalid spec (application absent)', () => {
    const document = buildSpecDocument({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
    });

    expect(() => specDocumentResponseSchema.parse(document)).not.toThrow();
  });
});
