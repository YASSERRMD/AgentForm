import { describe, expect, it } from 'vitest';
import { buildSpecDocument } from './spec-document.js';
import {
  promptToSpecRequestSchema,
  promptToSpecResponseSchema,
  specDocumentResponseSchema,
} from './http-contracts.js';

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

describe('promptToSpecRequestSchema', () => {
  it('accepts a non-empty prompt', () => {
    expect(() =>
      promptToSpecRequestSchema.parse({ prompt: 'add a summarizer agent' }),
    ).not.toThrow();
  });

  it('rejects an empty prompt', () => {
    expect(() => promptToSpecRequestSchema.parse({ prompt: '' })).toThrow();
  });
});

describe('promptToSpecResponseSchema', () => {
  it('accepts a successful proposal with a patch and no skipped resources', () => {
    const response = {
      success: true,
      summary: 'Added a summarizer agent.',
      patch: [{ op: 'add', path: ['spec', 'agents', 'summarizer'], value: { role: 'summarizer' } }],
      skipped: [],
      diagnostics: [],
    };

    expect(() => promptToSpecResponseSchema.parse(response)).not.toThrow();
  });

  it('accepts a rejected proposal carrying only diagnostics (generation itself failed)', () => {
    const response = {
      success: false,
      diagnostics: [{ code: 'AGF8006', severity: 'error', message: 'no API key configured' }],
    };

    expect(() => promptToSpecResponseSchema.parse(response)).not.toThrow();
  });

  it('accepts a rejected proposal that still carries the proposed patch and a skip reason', () => {
    const response = {
      success: false,
      summary: 'Redefined the primary model.',
      patch: [],
      skipped: [{ resourceType: 'models', resourceId: 'primary', reason: 'already exists' }],
      diagnostics: [{ code: 'AGF0001', severity: 'error', message: 'schema-invalid' }],
    };

    expect(() => promptToSpecResponseSchema.parse(response)).not.toThrow();
  });
});
