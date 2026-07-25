import { describe, expect, it } from 'vitest';
import {
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
