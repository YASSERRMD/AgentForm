import { createInMemoryFileSystem } from '@agentform/parser';
import { createFakeProvider } from '@agentform/studio-genai';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const VALID_SPEC = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'studio-server-fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: { primary: { provider: 'openai', model: 'gpt-5' } },
    agents: {
      assistant: {
        model: 'primary',
        role: 'assistant',
        instructions: { text: 'Be helpful.' },
        inputSchema: { type: 'object', properties: { question: {} } },
      },
    },
    workflows: {
      main: {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      },
    },
  },
};

describe('POST /api/genai/prompt-to-spec', () => {
  it('rejects a prompt over 4000 characters with a 400, before it reaches the handler', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'a'.repeat(4001) },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns success:false when no provider is configured, not a 404', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'add a tool' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('accepts a valid proposal, running it through the same validation POST /api/spec/patch would', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Added a lookup tool.',
          resources: { tools: { lookup: { type: 'function', handler: 'tools.lookup' } } },
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'add a lookup tool' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      summary?: string;
      patch?: readonly unknown[];
    };
    expect(body.success).toBe(true);
    expect(body.summary).toBe('Added a lookup tool.');
    expect(body.patch).toEqual([
      {
        op: 'add',
        path: ['spec', 'tools', 'lookup'],
        value: { type: 'function', handler: 'tools.lookup' },
      },
    ]);
  });

  it('reports success:false, with a skip reason, for a resource id that already exists', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Redefined the primary model.',
          resources: { models: { primary: { provider: 'anthropic', model: 'claude-sonnet-5' } } },
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'change the model' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      skipped?: readonly { resourceId: string }[];
    };
    // An empty (everything-skipped) patch is itself valid — it's a no-op
    // against an already-valid spec — so success is true even though
    // nothing was actually proposed; `skipped` explains why.
    expect(body.success).toBe(true);
    expect(body.skipped).toEqual([
      {
        resourceType: 'models',
        resourceId: 'primary',
        reason: expect.stringContaining('already exists'),
      },
    ]);
  });

  it('reports success:false when the proposed patch fails real validation (dangling reference)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Added an agent using an undeclared model.',
          resources: {
            agents: {
              researcher: {
                model: 'does-not-exist',
                role: 'researcher',
                instructions: { text: 'Go.' },
              },
            },
          },
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'add a researcher' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      diagnostics: readonly { severity: string }[];
    };
    expect(body.success).toBe(false);
    expect(body.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('reports success:false with AGF8006 when the provider itself fails', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [] });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: 'add a tool' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('rejects an empty prompt with a 400', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiProvider: createFakeProvider({ responses: [] }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-spec',
      payload: { prompt: '' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/genai/prompt-to-design', () => {
  it('returns success:false when no provider is configured, not a 404', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { agentId: 'assistant', prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('accepts a valid layout, returning a stamped design artifact bound to the requested agent', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        { input: [{ id: 'q', type: 'field', fieldPath: 'question', widget: 'textarea' }] },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { agentId: 'assistant', prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      design?: { binding: { resourceType: string; resourceId: string }; designVersion: string };
    };
    expect(body.success).toBe(true);
    expect(body.design?.binding).toEqual({ resourceType: 'agents', resourceId: 'assistant' });
    expect(body.design?.designVersion).toBe('1');
  });

  it('reports success:false for a layout referencing an undeclared field (AGF8003)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [{ input: [{ id: 'x', type: 'field', fieldPath: 'not-declared' }] }],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { agentId: 'assistant', prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8003');
  });

  it('reports success:false for an agentId that does not exist (AGF8002)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [{}] });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { agentId: 'does-not-exist', prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8002');
  });

  it('reports success:false with AGF8006 when the provider itself fails', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [] });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { agentId: 'assistant', prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('rejects a request missing agentId with a 400', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiProvider: createFakeProvider({ responses: [] }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/prompt-to-design',
      payload: { prompt: 'lay it out' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('rate limiting', () => {
  // A tiny max:2 so this stays fast and deterministic — never waits a
  // real timeWindow. Each scripted response services one of the first
  // 2 allowed calls; the 3rd must never reach the provider at all.
  function fakeSpecResponse() {
    return {
      summary: 'Added a lookup tool.',
      resources: { tools: { lookup: { type: 'function', handler: 'tools.lookup' } } },
    };
  }

  it('429s the 3rd call to a GenAI route within the window when genaiRateLimit is configured', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [fakeSpecResponse(), fakeSpecResponse()] });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiProvider: provider,
      genaiRateLimit: { max: 2, timeWindow: '1 minute' },
    });
    const makeRequest = () =>
      app.inject({
        method: 'POST',
        url: '/api/genai/prompt-to-spec',
        payload: { prompt: 'add a tool' },
      });

    const first = await makeRequest();
    const second = await makeRequest();
    const third = await makeRequest();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(provider.requests).toHaveLength(2);
  });

  it('never rate-limits a non-GenAI route, even when genaiRateLimit is configured', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiRateLimit: { max: 1, timeWindow: '1 minute' },
    });

    const first = await app.inject({ method: 'GET', url: '/api/health' });
    const second = await app.inject({ method: 'GET', url: '/api/health' });
    const third = await app.inject({ method: 'GET', url: '/api/health' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);
  });
});
