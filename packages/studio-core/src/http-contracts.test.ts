import { describe, expect, it } from 'vitest';
import { buildSpecDocument } from './spec-document.js';
import {
  auditEntrySchema,
  auditListResponseSchema,
  changeProvenanceSchema,
  patchSpecRequestSchema,
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

describe('changeProvenanceSchema', () => {
  it('accepts each real source value, with and without a summary', () => {
    expect(() => changeProvenanceSchema.parse({ source: 'manual' })).not.toThrow();
    expect(() =>
      changeProvenanceSchema.parse({ source: 'genai', summary: 'Added a tool.' }),
    ).not.toThrow();
    expect(() => changeProvenanceSchema.parse({ source: 'chat' })).not.toThrow();
  });

  it('rejects an unrecognized source', () => {
    expect(() => changeProvenanceSchema.parse({ source: 'bogus' })).toThrow();
  });
});

describe('patchSpecRequestSchema', () => {
  it('accepts a patch with no provenance (a plain pre-Phase-18 request)', () => {
    expect(() =>
      patchSpecRequestSchema.parse({
        patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
      }),
    ).not.toThrow();
  });

  it('accepts a patch carrying provenance', () => {
    expect(() =>
      patchSpecRequestSchema.parse({
        patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
        provenance: { source: 'chat', summary: 'Bumped the version.' },
      }),
    ).not.toThrow();
  });
});

describe('auditEntrySchema / auditListResponseSchema', () => {
  it('accepts a spec-targeted entry', () => {
    const entry = {
      timestamp: '2026-07-25T00:00:00.000Z',
      source: 'manual',
      summary: 'Updated spec.agents.assistant.role',
      target: { kind: 'spec' },
    };
    expect(() => auditEntrySchema.parse(entry)).not.toThrow();
  });

  it('accepts a design-targeted entry', () => {
    const entry = {
      timestamp: '2026-07-25T00:00:00.000Z',
      source: 'genai',
      summary: 'Updated layout for agents.assistant',
      target: { kind: 'design', resourceType: 'agents', resourceId: 'assistant' },
    };
    expect(() => auditEntrySchema.parse(entry)).not.toThrow();
  });

  it('accepts a list of entries', () => {
    expect(() =>
      auditListResponseSchema.parse({
        entries: [
          {
            timestamp: '2026-07-25T00:00:00.000Z',
            source: 'chat',
            summary: 'Removed the main workflow.',
            target: { kind: 'spec' },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('accepts an empty list', () => {
    expect(() => auditListResponseSchema.parse({ entries: [] })).not.toThrow();
  });
});
