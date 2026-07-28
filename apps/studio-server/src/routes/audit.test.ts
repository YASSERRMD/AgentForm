import type { FileSystem } from '@agentform/parser';
import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { FileWriter } from '../lib/file-writer.js';

/** See apply-spec-patch.test.ts for why this needs a writable double sharing one backing store, not the read-only createInMemoryFileSystem paired with a separate in-memory FileWriter: a write via one has to be visible to a read via the other, or a write-then-GET test can never actually observe the write. */
function createSharedInMemoryProject(initialFiles: Record<string, string>): {
  readonly fs: FileSystem;
  readonly fileWriter: FileWriter;
} {
  const files = new Map(Object.entries(initialFiles));
  const fs: FileSystem = {
    readFile: (absolutePath) => {
      const contents = files.get(absolutePath);
      if (contents === undefined) {
        throw new Error(`ENOENT: no such file: ${absolutePath}`);
      }
      return contents;
    },
    exists: (absolutePath) => files.has(absolutePath),
    listFiles: () => [],
  };
  const fileWriter: FileWriter = {
    writeFile: (absolutePath, content) => {
      files.set(absolutePath, content);
    },
  };
  return { fs, fileWriter };
}

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

describe('GET /api/audit', () => {
  it('returns an empty list when nothing has ever been written, not an error', async () => {
    const fs = createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/audit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entries: [],
      verification: { valid: true, verifiedEntryCount: 0, totalEntryCount: 0 },
    });
  });

  it('lists an entry recorded by a prior design write, newest first', async () => {
    const { fs, fileWriter } = createSharedInMemoryProject({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: { binding: { resourceType: 'agents', resourceId: 'assistant' } },
        provenance: { source: 'chat', summary: 'Cleared the layout.' },
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/audit' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { entries: readonly { source: string; summary: string }[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ source: 'chat', summary: 'Cleared the layout.' });
  });

  it('lists two writes newest first', async () => {
    const { fs, fileWriter } = createSharedInMemoryProject({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    await app.inject({
      method: 'POST',
      url: '/api/spec/patch',
      payload: {
        patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
        provenance: { source: 'manual', summary: 'Bumped the version.' },
      },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: {
        design: { binding: { resourceType: 'agents', resourceId: 'assistant' } },
        provenance: { source: 'genai', summary: 'Cleared the layout.' },
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/audit' });

    const body = response.json() as { entries: readonly { summary: string }[] };
    expect(body.entries.map((entry) => entry.summary)).toEqual([
      'Cleared the layout.',
      'Bumped the version.',
    ]);
  });

  it('reports an intact hash chain after two real writes', async () => {
    const { fs, fileWriter } = createSharedInMemoryProject({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    await app.inject({
      method: 'POST',
      url: '/api/spec/patch',
      payload: { patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }] },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/design/agents/assistant',
      payload: { design: { binding: { resourceType: 'agents', resourceId: 'assistant' } } },
    });

    const response = await app.inject({ method: 'GET', url: '/api/audit' });

    const body = response.json() as { verification: unknown };
    expect(body.verification).toEqual({
      valid: true,
      verifiedEntryCount: 2,
      totalEntryCount: 2,
    });
  });

  it('serves a pre-hardening legacy entry (written before hash-chaining existed) instead of 500ing', async () => {
    const legacyLine = JSON.stringify({
      timestamp: '2026-01-01T00:00:00.000Z',
      source: 'manual',
      summary: 'written before hashing existed',
      target: { kind: 'spec' },
    });
    const fs = createInMemoryFileSystem({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
      '/project/.agentform/studio-audit.jsonl': `${legacyLine}\n`,
    });
    const app = buildApp({ rootDir: '/project', fs });

    const response = await app.inject({ method: 'GET', url: '/api/audit' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { entries: readonly { summary: string }[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ summary: 'written before hashing existed' });
  });
});
