import { createInMemoryFileSystem } from '@agentform/parser';
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

describe('GET /api/spec', () => {
  it('returns the validated application for a valid project', async () => {
    const fs = createInMemoryFileSystem({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/spec' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { application?: { metadata: { name: string } }; diagnostics: { severity: string }[] };
    expect(body.application?.metadata.name).toBe('studio-server-fixture');
    expect(body.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('returns diagnostics only, no application, for an invalid project', async () => {
    const fs = createInMemoryFileSystem({});
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/spec' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { application?: unknown; diagnostics: { severity: string }[] };
    expect(body.application).toBeUndefined();
    expect(body.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
