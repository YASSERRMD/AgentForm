import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { loadSpecDocument } from './load-spec-document.js';

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

describe('loadSpecDocument', () => {
  it('returns the validated application for a valid project', () => {
    const fs = createInMemoryFileSystem({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });

    const result = loadSpecDocument({ rootDir: '/project', fs });

    expect(result.application?.metadata.name).toBe('studio-server-fixture');
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('returns error diagnostics and no application when no entry file exists', () => {
    const fs = createInMemoryFileSystem({});

    const result = loadSpecDocument({ rootDir: '/project', fs });

    expect(result.application).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('returns error diagnostics and no application for a schema-invalid project', () => {
    const fs = createInMemoryFileSystem({
      '/project/agentform.json': JSON.stringify({
        apiVersion: 'agentform.dev/v1alpha1',
        kind: 'AgenticApplication',
      }),
    });

    const result = loadSpecDocument({ rootDir: '/project', fs });

    expect(result.application).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
