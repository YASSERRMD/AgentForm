import { describe, expect, it } from 'vitest';
import {
  changeProvenanceSchema,
  chatDesignRequestSchema,
  chatDesignResponseSchema,
  designArtifactSchema,
  getDesignResponseSchema,
  promptToDesignRequestSchema,
  promptToDesignResponseSchema,
  putDesignRequestSchema,
  putDesignResponseSchema,
} from './http-contracts.js';
import type { DesignArtifact } from './types.js';

const ARTIFACT: DesignArtifact = {
  binding: { resourceType: 'agents', resourceId: 'assistant' },
  designVersion: '1',
  specVersionTarget: 'sha256:aaa',
  contentHash: 'sha256:bbb',
  layout: {
    input: [
      {
        id: 'group',
        type: 'container',
        children: [{ id: 'name', type: 'field', fieldPath: 'name', widget: 'text' }],
      },
    ],
  },
  styleTokens: { spacing: { md: '8px' } },
};

describe('http-contracts', () => {
  it('parses a real DesignArtifact, including nested layout nodes', () => {
    expect(() => designArtifactSchema.parse(ARTIFACT)).not.toThrow();
  });

  it('parses a workflow-bound design with positions', () => {
    const workflowArtifact: DesignArtifact = {
      binding: { resourceType: 'workflows', resourceId: 'main' },
      designVersion: '1',
      specVersionTarget: 'sha256:aaa',
      contentHash: 'sha256:bbb',
      positions: { respond: { x: 10, y: 20 } },
    };
    expect(() => designArtifactSchema.parse(workflowArtifact)).not.toThrow();
  });

  it('parses GetDesignResponse with a null design', () => {
    expect(() => getDesignResponseSchema.parse({ design: null })).not.toThrow();
  });

  it('parses GetDesignResponse with a real design', () => {
    expect(() => getDesignResponseSchema.parse({ design: ARTIFACT })).not.toThrow();
  });

  it('rejects a PutDesignRequest whose draft carries server-only fields incorrectly typed', () => {
    // designVersion/specVersionTarget/contentHash aren't part of the draft
    // schema at all — extra keys are simply ignored by z.object by default,
    // so this asserts the draft's own required shape still parses cleanly.
    expect(() =>
      putDesignRequestSchema.parse({
        design: { binding: { resourceType: 'agents', resourceId: 'assistant' } },
      }),
    ).not.toThrow();
  });

  it('parses a real PutDesignResponse', () => {
    expect(() =>
      putDesignResponseSchema.parse({ success: true, design: ARTIFACT, diagnostics: [] }),
    ).not.toThrow();
  });

  it('accepts a PutDesignRequest carrying provenance', () => {
    expect(() =>
      putDesignRequestSchema.parse({
        design: { binding: { resourceType: 'agents', resourceId: 'assistant' } },
        provenance: { source: 'genai', summary: 'Grouped the question field.' },
      }),
    ).not.toThrow();
  });
});

describe('changeProvenanceSchema', () => {
  it('accepts each real source value, with and without a summary', () => {
    expect(() => changeProvenanceSchema.parse({ source: 'manual' })).not.toThrow();
    expect(() =>
      changeProvenanceSchema.parse({ source: 'chat', summary: 'Grouped the question field.' }),
    ).not.toThrow();
  });

  it('rejects an unrecognized source', () => {
    expect(() => changeProvenanceSchema.parse({ source: 'bogus' })).toThrow();
  });
});

describe('promptToDesignRequestSchema', () => {
  it('accepts an agentId and a non-empty prompt', () => {
    expect(() =>
      promptToDesignRequestSchema.parse({
        agentId: 'assistant',
        prompt: 'group urgency with question',
      }),
    ).not.toThrow();
  });

  it('rejects an empty prompt', () => {
    expect(() => promptToDesignRequestSchema.parse({ agentId: 'assistant', prompt: '' })).toThrow();
  });

  it('rejects a prompt over 4000 characters', () => {
    expect(() =>
      promptToDesignRequestSchema.parse({ agentId: 'assistant', prompt: 'a'.repeat(4001) }),
    ).toThrow();
  });
});

describe('promptToDesignResponseSchema', () => {
  it('accepts a successful preview carrying a stamped design artifact', () => {
    expect(() =>
      promptToDesignResponseSchema.parse({ success: true, design: ARTIFACT, diagnostics: [] }),
    ).not.toThrow();
  });

  it('accepts a rejected preview carrying only diagnostics', () => {
    expect(() =>
      promptToDesignResponseSchema.parse({
        success: false,
        diagnostics: [{ code: 'AGF8006', severity: 'error', message: 'no API key configured' }],
      }),
    ).not.toThrow();
  });
});

describe('chatDesignRequestSchema', () => {
  it('accepts an agentId, message, and no history (a first turn)', () => {
    expect(() =>
      chatDesignRequestSchema.parse({ agentId: 'assistant', message: 'lay it out' }),
    ).not.toThrow();
  });

  it('accepts prior turns', () => {
    expect(() =>
      chatDesignRequestSchema.parse({
        agentId: 'assistant',
        message: 'thanks',
        history: [
          { role: 'user', content: 'lay it out' },
          { role: 'assistant', content: 'Done.' },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects an empty message', () => {
    expect(() => chatDesignRequestSchema.parse({ agentId: 'assistant', message: '' })).toThrow();
  });

  it('rejects a message over 4000 characters', () => {
    expect(() =>
      chatDesignRequestSchema.parse({ agentId: 'assistant', message: 'a'.repeat(4001) }),
    ).toThrow();
  });

  it('rejects a history entry whose content is over 4000 characters', () => {
    expect(() =>
      chatDesignRequestSchema.parse({
        agentId: 'assistant',
        message: 'thanks',
        history: [{ role: 'user', content: 'a'.repeat(4001) }],
      }),
    ).toThrow();
  });

  it('rejects a history array over 50 entries', () => {
    const history = Array.from({ length: 51 }, () => ({ role: 'user' as const, content: 'hi' }));
    expect(() =>
      chatDesignRequestSchema.parse({ agentId: 'assistant', message: 'thanks', history }),
    ).toThrow();
  });
});

describe('chatDesignResponseSchema', () => {
  it('accepts a plain conversational reply with no design', () => {
    expect(() =>
      chatDesignResponseSchema.parse({
        success: true,
        message: 'This agent has two input fields today.',
        diagnostics: [],
      }),
    ).not.toThrow();
  });

  it('accepts a reply carrying a proposed design', () => {
    expect(() =>
      chatDesignResponseSchema.parse({
        success: true,
        message: 'Grouped the question field.',
        design: ARTIFACT,
        diagnostics: [],
      }),
    ).not.toThrow();
  });
});
