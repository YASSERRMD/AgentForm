import type { FileSystem } from '@agentform/parser';
import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { applySpecPatch } from './apply-spec-patch.js';
import { createInMemoryFileWriter, type FileWriter } from './file-writer.js';

const ENTRY_PATH = '/project/agentform.yaml';

/**
 * `@agentform/parser`'s `createInMemoryFileSystem` closes over a fixed,
 * immutable snapshot — real production code doesn't need a writable
 * fake filesystem (the parser never writes), but `applySpecPatch`'s
 * write-then-re-read-from-disk step genuinely needs one here: a real
 * disk write is naturally visible to the next real read, and this test
 * double has to be too, or "returns what's actually on disk now" can
 * never be verified.
 */
function createSharedInMemoryProject(initialFiles: Record<string, string>): {
  readonly fs: FileSystem;
  readonly fileWriter: FileWriter;
  readonly files: Map<string, string>;
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
  return { fs, fileWriter, files };
}

const VALID_YAML = `apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication

metadata:
  name: fixture-app
  version: 1.0.0

spec:
  runtime:
    target: openai # a real comment a lossy round trip would drop
    environment: development
  models:
    primary:
      provider: openai
      model: gpt-5
  agents:
    assistant:
      model: primary
      role: assistant
      instructions:
        text: Be helpful.
  workflows:
    main:
      entrypoint: assistant
      nodes:
        assistant:
          type: agent
          agent: assistant
`;

describe('applySpecPatch', () => {
  it('writes a valid replace patch to disk, preserving comments and formatting elsewhere', () => {
    const { fs, fileWriter, files } = createSharedInMemoryProject({ [ENTRY_PATH]: VALID_YAML });

    const result = applySpecPatch({
      rootDir: '/project',
      fs,
      fileWriter,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(true);
    expect(result.application?.metadata.version).toBe('2.0.0');
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);

    const written = files.get(ENTRY_PATH);
    expect(written).toBeDefined();
    expect(written).toContain('version: 2.0.0');
    expect(written).toContain('# a real comment a lossy round trip would drop');
    expect(written).toContain('provider: openai');
  });

  it('adds a new resource via an add patch', () => {
    const { fs, fileWriter, files } = createSharedInMemoryProject({ [ENTRY_PATH]: VALID_YAML });

    const result = applySpecPatch({
      rootDir: '/project',
      fs,
      fileWriter,
      patch: [
        {
          op: 'add',
          path: ['spec', 'models', 'secondary'],
          value: { provider: 'anthropic', model: 'claude' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.application?.spec.models.secondary).toEqual({
      provider: 'anthropic',
      model: 'claude',
    });
    expect(files.get(ENTRY_PATH)).toContain('secondary:');
  });

  it('rejects a patch that produces a schema-invalid document and writes nothing', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();

    const result = applySpecPatch({
      rootDir: '/project',
      fs,
      fileWriter,
      patch: [{ op: 'remove', path: ['metadata', 'version'] }],
    });

    expect(result.success).toBe(false);
    expect(result.application).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects a patch on a project with no entry file', () => {
    const fs = createInMemoryFileSystem({});
    const fileWriter = createInMemoryFileWriter();

    const result = applySpecPatch({
      rootDir: '/project',
      fs,
      fileWriter,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(false);
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects a patch on a multi-file project (tools resolved via $ref) and writes nothing', () => {
    const multiFileYaml = VALID_YAML.replace(
      'agents:\n    assistant:',
      'tools:\n    $ref: tools.yaml\n  agents:\n    assistant:',
    ).replace('        text: Be helpful.', '        text: Be helpful.\n      tools: [lookup]');
    const fs = createInMemoryFileSystem({
      [ENTRY_PATH]: multiFileYaml,
      '/project/tools.yaml': 'lookup:\n  type: function\n  handler: lookup.js\n',
    });
    const fileWriter = createInMemoryFileWriter();

    const result = applySpecPatch({
      rootDir: '/project',
      fs,
      fileWriter,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('AGF8001');
    expect(fileWriter.written.size).toBe(0);
  });
});
