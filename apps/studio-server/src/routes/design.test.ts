import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createInMemoryFileWriter } from '../lib/file-writer.js';

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
        inputSchema: { type: 'object', properties: { name: {} } },
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

describe('GET /api/design/:resourceType/:resourceId', () => {
  it('returns {design: null} when none exists yet, not a 404', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/design/agents/assistant' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ design: null });
  });

  it('rejects an unknown resourceType with a 400', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/design/bogus/assistant' });

    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /api/design/:resourceType/:resourceId', () => {
  it('writes a valid form-layout draft and returns the stamped artifact', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: {
          binding: { resourceType: 'agents', resourceId: 'assistant' },
          layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name', widget: 'text' }] },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; design?: { designVersion: string } };
    expect(body.success).toBe(true);
    expect(body.design?.designVersion).toBe('1');
    // The design artifact itself, plus the audit-log entry (Phase 18).
    expect(fileWriter.written.size).toBe(2);
  });

  it('records the request body provenance in the local audit log', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: {
          binding: { resourceType: 'agents', resourceId: 'assistant' },
          layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name', widget: 'text' }] },
        },
        provenance: { source: 'genai', summary: 'Grouped the name field.' },
      },
    });

    const auditContent = [...fileWriter.written.entries()].find(([path]) =>
      path.endsWith('.agentform/studio-audit.jsonl'),
    )?.[1];
    expect(JSON.parse(auditContent!.trim())).toMatchObject({
      source: 'genai',
      summary: 'Grouped the name field.',
    });
  });

  it('rejects a dangling field-path binding with a 200 success:false, writing nothing', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: {
          binding: { resourceType: 'agents', resourceId: 'assistant' },
          layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'not-declared' }] },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; diagnostics: readonly { code: string }[] };
    expect(body.success).toBe(false);
    expect(body.diagnostics[0]?.code).toBe('AGF8003');
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects a request whose URL and body binding disagree, writing nothing', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: { binding: { resourceType: 'workflows', resourceId: 'main' } },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean };
    expect(body.success).toBe(false);
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects a malformed body (bad widget enum) with a 400, writing nothing', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: {
          binding: { resourceType: 'agents', resourceId: 'assistant' },
          layout: { input: [{ id: 'f1', type: 'field', widget: 'not-a-real-widget' }] },
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fileWriter.written.size).toBe(0);
  });
});
