import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { DatasetLoadError, loadDatasetFile, loadDatasets } from './dataset.js';

const ROOT = '/project';

describe('loadDatasetFile', () => {
  it('loads a .jsonl dataset — one JSON test case per line, matching §17’s own example', () => {
    const fs = createInMemoryFileSystem({
      '/project/tests/complaints.jsonl': [
        JSON.stringify({
          name: 'duplicate complaints are not recreated',
          workflow: 'main',
          input: { description: 'Streetlight is broken', locationId: 'LOC-101' },
          mocks: { 'complaint-registry-search': { return: { duplicateFound: true } } },
          assertions: [{ type: 'toolCalled', tool: 'complaint-registry-search' }],
        }),
        JSON.stringify({
          name: 'a second case',
          workflow: 'main',
          assertions: [{ type: 'nodeVisited', node: 'intake' }],
        }),
      ].join('\n'),
    });
    const cases = loadDatasetFile(fs, ROOT, 'tests/complaints.jsonl');
    expect(cases).toHaveLength(2);
    expect(cases[0]?.name).toBe('duplicate complaints are not recreated');
  });

  it('loads a .yaml dataset with a top-level tests: array', () => {
    const fs = createInMemoryFileSystem({
      '/project/tests/complaints.yaml': [
        'tests:',
        '  - name: basic case',
        '    workflow: main',
        '    assertions:',
        '      - type: nodeVisited',
        '        node: intake',
      ].join('\n'),
    });
    const cases = loadDatasetFile(fs, ROOT, 'tests/complaints.yaml');
    expect(cases).toEqual([
      {
        name: 'basic case',
        workflow: 'main',
        assertions: [{ type: 'nodeVisited', node: 'intake' }],
      },
    ]);
  });

  it('loads a .json dataset that is a bare array', () => {
    const fs = createInMemoryFileSystem({
      '/project/tests/complaints.json': JSON.stringify([
        {
          name: 'basic case',
          workflow: 'main',
          assertions: [{ type: 'nodeVisited', node: 'intake' }],
        },
      ]),
    });
    expect(loadDatasetFile(fs, ROOT, 'tests/complaints.json')).toHaveLength(1);
  });

  it('rejects a dataset path that escapes the project root', () => {
    const fs = createInMemoryFileSystem({});
    expect(() => loadDatasetFile(fs, ROOT, '../outside.jsonl')).toThrow();
  });

  it('rejects a missing dataset file with a clear error', () => {
    const fs = createInMemoryFileSystem({});
    expect(() => loadDatasetFile(fs, ROOT, 'tests/missing.jsonl')).toThrow(DatasetLoadError);
  });

  it('rejects a test case that fails schema validation', () => {
    const fs = createInMemoryFileSystem({
      '/project/tests/bad.jsonl': JSON.stringify({ name: 'no workflow field', assertions: [] }),
    });
    expect(() => loadDatasetFile(fs, ROOT, 'tests/bad.jsonl')).toThrow(DatasetLoadError);
  });

  it('rejects malformed JSON in a .jsonl line with the line number', () => {
    const fs = createInMemoryFileSystem({ '/project/tests/bad.jsonl': 'not json at all' });
    expect(() => loadDatasetFile(fs, ROOT, 'tests/bad.jsonl')).toThrow(/tests\/bad\.jsonl:1/);
  });
});

describe('loadDatasets', () => {
  it('flattens every declared dataset file into one list, in order', () => {
    const fs = createInMemoryFileSystem({
      '/project/a.jsonl': JSON.stringify({
        name: 'a',
        workflow: 'main',
        assertions: [{ type: 'nodeVisited', node: 'x' }],
      }),
      '/project/b.jsonl': JSON.stringify({
        name: 'b',
        workflow: 'main',
        assertions: [{ type: 'nodeVisited', node: 'y' }],
      }),
    });
    const cases = loadDatasets(fs, ROOT, ['a.jsonl', 'b.jsonl']);
    expect(cases.map((c) => c.name)).toEqual(['a', 'b']);
  });
});
