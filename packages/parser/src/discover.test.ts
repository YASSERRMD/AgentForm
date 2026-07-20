import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInMemoryFileSystem } from './filesystem.js';
import { discoverEntryFile, discoverResourceCollection } from './discover.js';

const rootDir = path.resolve('/project');

describe('discoverEntryFile', () => {
  it('finds the single supported entry filename present', () => {
    const fs = createInMemoryFileSystem({ [path.join(rootDir, 'agentform.yaml')]: '' });
    expect(discoverEntryFile(rootDir, fs)).toEqual({ file: 'agentform.yaml', diagnostics: [] });
  });

  it('reports an error when no entry file exists', () => {
    const fs = createInMemoryFileSystem({});
    const result = discoverEntryFile(rootDir, fs);
    expect(result.file).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('AGF1001');
  });

  it('reports an error when multiple entry files exist', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agentform.yaml')]: '',
      [path.join(rootDir, 'agentform.json')]: '',
    });
    const result = discoverEntryFile(rootDir, fs);
    expect(result.file).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('AGF1005');
  });
});

describe('discoverResourceCollection', () => {
  it('discovers resources keyed by file basename', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: 'role: researcher\n',
      [path.join(rootDir, 'agents/writer.yaml')]: 'role: writer\n',
    });

    const result = discoverResourceCollection('agents', rootDir, fs, new Set());

    expect(result.diagnostics).toEqual([]);
    expect(result.resources).toEqual({
      researcher: { role: 'researcher' },
      writer: { role: 'writer' },
    });
  });

  it('silently skips a file already consumed by an explicit $ref', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: 'role: researcher\n',
    });

    const result = discoverResourceCollection(
      'agents',
      rootDir,
      fs,
      new Set(['researcher']),
      new Set(['agents/researcher.yaml']),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.resources).toEqual({});
  });

  it('reports a genuine duplicate when the key collides via a different route', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: 'role: file-researcher\n',
    });

    const result = discoverResourceCollection('agents', rootDir, fs, new Set(['researcher']));

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1005');
    expect(result.resources).toEqual({});
  });

  it('returns no resources when the collection directory does not exist', () => {
    const fs = createInMemoryFileSystem({});
    const result = discoverResourceCollection('tools', rootDir, fs, new Set());
    expect(result.resources).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it('enforces the max source file size on an auto-discovered file', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: `role: ${'a'.repeat(100)}\n`,
    });

    const result = discoverResourceCollection(
      'agents',
      rootDir,
      fs,
      new Set(),
      new Set(),
      undefined,
      50,
    );

    expect(result.diagnostics.some((d) => d.code === 'AGF1010')).toBe(true);
  });
});
