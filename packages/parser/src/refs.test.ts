import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument } from './document.js';
import { createInMemoryFileSystem } from './filesystem.js';
import { resolveReferences } from './refs.js';

const rootDir = path.resolve('/project');

function parseEntry(text: string) {
  return loadDocument(text, 'agentform.yaml');
}

describe('resolveReferences', () => {
  it('splices a single referenced file in place of its $ref object', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: 'role: researcher\nmodel: primary\n',
    });
    const entry = parseEntry('agents:\n  researcher:\n    $ref: ./agents/researcher.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      agents: { researcher: { role: 'researcher', model: 'primary' } },
    });
  });

  it('follows nested references inside a referenced file', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]:
        'role: researcher\ntools:\n  $ref: ../tools/search.yaml\n',
      [path.join(rootDir, 'tools/search.yaml')]: '- search\n- lookup\n',
    });
    const entry = parseEntry('agents:\n  researcher:\n    $ref: ./agents/researcher.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      agents: { researcher: { role: 'researcher', tools: ['search', 'lookup'] } },
    });
  });

  it('records a source map entry, rooted at the reference field path, for the referenced content', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/researcher.yaml')]: 'role: researcher\n',
    });
    const entry = parseEntry('agents:\n  researcher:\n    $ref: ./agents/researcher.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.sourceMap.get('agents.researcher.role')).toEqual({
      file: 'agents/researcher.yaml',
      line: 1,
      column: 1,
    });
  });

  it('detects a direct reference cycle and reports it as a diagnostic instead of recursing forever', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'a.yaml')]: 'next:\n  $ref: ./b.yaml\n',
      [path.join(rootDir, 'b.yaml')]: 'next:\n  $ref: ./a.yaml\n',
    });
    const entry = parseEntry('root:\n  $ref: ./a.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics.some((d) => d.code === 'AGF1003')).toBe(true);
  });

  it('reports a missing reference target as a diagnostic', () => {
    const fs = createInMemoryFileSystem({});
    const entry = parseEntry('agents:\n  researcher:\n    $ref: ./agents/researcher.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1001');
  });

  it('rejects a path traversal attempt as an unsafe-path diagnostic', () => {
    const fs = createInMemoryFileSystem({
      [path.resolve(rootDir, '../outside.yaml')]: 'secret: leaked\n',
    });
    const entry = parseEntry('data:\n  $ref: ../../outside.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1002');
    expect(result.value).toEqual({ data: undefined });
  });

  it('enforces a maximum reference depth instead of recursing indefinitely', () => {
    const files: Record<string, string> = {};
    const depth = 5;
    for (let i = 0; i < depth; i += 1) {
      files[path.join(rootDir, `link${i}.yaml`)] = `next:\n  $ref: ./link${i + 1}.yaml\n`;
    }
    files[path.join(rootDir, `link${depth}.yaml`)] = 'value: leaf\n';
    const fs = createInMemoryFileSystem(files);
    const entry = parseEntry('root:\n  $ref: ./link0.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
      maxDepth: 2,
    });

    expect(result.diagnostics.some((d) => d.code === 'AGF1004')).toBe(true);
  });

  it('resolves a file reference to inline text', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'prompts/intake.md')]: 'You are a complaint intake agent.',
    });
    const entry = parseEntry(
      'agents:\n  intake:\n    instructions:\n      file: prompts/intake.md\n',
    );

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      agents: { intake: { instructions: { text: 'You are a complaint intake agent.' } } },
    });
  });

  it('resolves a schemaRef reference to a parsed inline schema', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'schemas/complaint.json')]: JSON.stringify({ type: 'object' }),
    });
    const entry = parseEntry('responseFormat:\n  schemaRef: schemas/complaint.json\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ responseFormat: { schema: { type: 'object' } } });
  });

  it('resolves a file reference nested inside a $ref-loaded file relative to THAT file, not the entry file', () => {
    // This is the scenario that exposed the original bug: agents/intake.yaml
    // references "../prompts/intake.md", which only resolves correctly
    // relative to agents/ (giving prompts/intake.md) — resolving it
    // relative to the project root instead would walk outside the root
    // entirely and incorrectly fail as an unsafe path.
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'agents/intake.yaml')]:
        'role: intake\ninstructions:\n  file: ../prompts/intake.md\n',
      [path.join(rootDir, 'prompts/intake.md')]: 'You are an intake agent.',
    });
    const entry = parseEntry('agents:\n  intake:\n    $ref: ./agents/intake.yaml\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      agents: { intake: { role: 'intake', instructions: { text: 'You are an intake agent.' } } },
    });
  });

  it('does not recurse into a resolved schema looking for further markers', () => {
    const fs = createInMemoryFileSystem({
      [path.join(rootDir, 'schemas/nested.json')]: JSON.stringify({
        file: 'not-a-real-reference.md',
      }),
    });
    const entry = parseEntry('responseFormat:\n  schemaRef: schemas/nested.json\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      responseFormat: { schema: { file: 'not-a-real-reference.md' } },
    });
  });

  it('reports a missing file reference and resolves it to undefined, consistent with a missing $ref', () => {
    const fs = createInMemoryFileSystem({});
    const entry = parseEntry('instructions:\n  file: prompts/missing.md\n');

    const result = resolveReferences(entry.value, 'agentform.yaml', entry.sourceMap, {
      rootDir,
      fs,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1001');
    expect(result.value).toEqual({ instructions: undefined });
  });
});
