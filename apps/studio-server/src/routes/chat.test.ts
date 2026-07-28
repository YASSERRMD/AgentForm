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

describe('POST /api/genai/chat/spec', () => {
  it('rejects a message over 4000 characters with a 400, before it reaches the handler', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'a'.repeat(4001) },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns success:false when no provider is configured, not a 404', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'what model does the assistant use?' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('returns a plain conversational reply with no patch', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [{ type: 'message', message: 'The assistant uses the primary model.' }],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'what model does the assistant use?' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; message: string; patch?: unknown[] };
    expect(body.success).toBe(true);
    expect(body.message).toBe('The assistant uses the primary model.');
    expect(body.patch).toBeUndefined();
  });

  it('accepts a valid proposal, running it through the same validation POST /api/spec/patch would', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: "I've added a lookup tool.",
          patch: [
            {
              op: 'add',
              path: ['spec', 'tools', 'lookup'],
              value: { type: 'function', handler: 'x' },
            },
          ],
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'add a lookup tool' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; message: string; patch?: unknown[] };
    expect(body.success).toBe(true);
    expect(body.message).toBe("I've added a lookup tool.");
    expect(body.patch).toEqual([
      { op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function', handler: 'x' } },
    ]);
  });

  it('reports success:false when the proposed patch fails real validation (dangling reference)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: 'Added an agent using an undeclared model.',
          patch: [
            {
              op: 'add',
              path: ['spec', 'agents', 'researcher'],
              value: { model: 'does-not-exist', role: 'researcher', instructions: { text: 'Go.' } },
            },
          ],
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'add a researcher' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      diagnostics: readonly { severity: string }[];
    };
    expect(body.success).toBe(false);
    expect(body.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('passes prior conversation history through to the provider', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [{ type: 'message', message: 'ok' }] });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });
    const history = [
      { role: 'user', content: 'add a lookup tool' },
      { role: 'assistant', content: "I've added a lookup tool." },
    ];

    await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'thanks', history },
    });

    expect(provider.requests[0]?.history).toEqual(history);
  });

  it('reports success:false with AGF8006 when the provider itself fails', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({ responses: [] });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: 'add a tool' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('rejects an empty message with a 400', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiProvider: createFakeProvider({ responses: [] }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/spec',
      payload: { message: '' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/genai/chat/design', () => {
  it('returns success:false when no provider is configured, not a 404', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/design',
      payload: { agentId: 'assistant', message: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8006');
  });

  it('returns a plain conversational reply with no design', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [{ type: 'message', message: 'This agent has one input field today.' }],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/design',
      payload: { agentId: 'assistant', message: 'what fields does this have?' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; message: string; design?: unknown };
    expect(body.success).toBe(true);
    expect(body.message).toBe('This agent has one input field today.');
    expect(body.design).toBeUndefined();
  });

  it('accepts a valid layout proposal, returning a stamped design artifact bound to the requested agent', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: 'Grouped the question field.',
          layout: {
            input: [{ id: 'q', type: 'field', fieldPath: 'question', widget: 'textarea' }],
          },
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/design',
      payload: { agentId: 'assistant', message: 'lay out the question field' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      message: string;
      design?: { binding: { resourceType: string; resourceId: string } };
    };
    expect(body.success).toBe(true);
    expect(body.message).toBe('Grouped the question field.');
    expect(body.design?.binding).toEqual({ resourceType: 'agents', resourceId: 'assistant' });
  });

  it('reports success:false for a layout referencing an undeclared field (AGF8003)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: 'ok',
          layout: { input: [{ id: 'x', type: 'field', fieldPath: 'not-declared' }] },
        },
      ],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/design',
      payload: { agentId: 'assistant', message: 'lay it out' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8003');
  });

  it('reports success:false for an agentId that does not exist (AGF8002)', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const provider = createFakeProvider({
      responses: [{ type: 'proposal', message: 'ok', layout: {} }],
    });
    const app = buildApp({ rootDir: '/project', fs, genaiProvider: provider });

    const response = await app.inject({
      method: 'POST',
      url: '/api/genai/chat/design',
      payload: { agentId: 'does-not-exist', message: 'lay it out' },
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
      url: '/api/genai/chat/design',
      payload: { agentId: 'assistant', message: 'lay it out' },
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
      url: '/api/genai/chat/design',
      payload: { message: 'lay it out' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('rate limiting', () => {
  // Same tiny max:2 pattern as genai.test.ts — fast, deterministic, never
  // waits a real timeWindow.
  it('429s the 3rd call to a chat route within the window when genaiRateLimit is configured', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const reply = { type: 'message', message: 'The assistant uses the primary model.' };
    const provider = createFakeProvider({ responses: [reply, reply] });
    const app = buildApp({
      rootDir: '/project',
      fs,
      genaiProvider: provider,
      genaiRateLimit: { max: 2, timeWindow: '1 minute' },
    });
    const makeRequest = () =>
      app.inject({
        method: 'POST',
        url: '/api/genai/chat/spec',
        payload: { message: 'what model does the assistant use?' },
      });

    const first = await makeRequest();
    const second = await makeRequest();
    const third = await makeRequest();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(provider.requests).toHaveLength(2);
  });
});
