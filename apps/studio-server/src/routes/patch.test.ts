import type { FileSystem } from '@agentform/parser';
import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createInMemoryFileWriter, type FileWriter } from '../lib/file-writer.js';

/** See apply-spec-patch.test.ts for why this needs a writable double, not the read-only createInMemoryFileSystem alone: a real disk write is visible to the next real read, and the double has to be too. */
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

describe('POST /api/spec/patch', () => {
  it('applies a valid patch and returns the updated application', async () => {
    const { fs, fileWriter } = createSharedInMemoryProject({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'POST',
      url: '/api/spec/patch',
      payload: { patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { success: boolean; application?: { metadata: { version: string } } };
    expect(body.success).toBe(true);
    expect(body.application?.metadata.version).toBe('2.0.0');
  });

  it('rejects a malformed request body (empty path) with a 400, writing nothing', async () => {
    const fs = createInMemoryFileSystem({
      '/project/agentform.json': JSON.stringify(VALID_SPEC),
    });
    const fileWriter = createInMemoryFileWriter();
    const app = buildApp({ rootDir: '/project', fs, fileWriter });

    const response = await app.inject({
      method: 'POST',
      url: '/api/spec/patch',
      payload: { patch: [{ op: 'replace', path: [], value: 'anything' }] },
    });

    expect(response.statusCode).toBe(400);
    expect(fileWriter.written.size).toBe(0);
  });
});
