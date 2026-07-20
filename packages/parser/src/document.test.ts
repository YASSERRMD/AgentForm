import { describe, expect, it } from 'vitest';
import { loadDocument } from './document.js';

describe('loadDocument (YAML)', () => {
  it('parses a simple document with no diagnostics', () => {
    const result = loadDocument(
      ['metadata:', '  name: fixture-app', '  version: 1.0.0', ''].join('\n'),
      'agentform.yaml',
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ metadata: { name: 'fixture-app', version: '1.0.0' } });
  });

  it('records the line and column of every mapping key', () => {
    const result = loadDocument(
      ['metadata:', '  name: fixture-app', '  version: 1.0.0', ''].join('\n'),
      'agentform.yaml',
    );

    expect(result.sourceMap.get('metadata')).toEqual({
      file: 'agentform.yaml',
      line: 1,
      column: 1,
    });
    expect(result.sourceMap.get('metadata.name')).toEqual({
      file: 'agentform.yaml',
      line: 2,
      column: 3,
    });
    expect(result.sourceMap.get('metadata.version')).toEqual({
      file: 'agentform.yaml',
      line: 3,
      column: 3,
    });
  });

  it('records the line and column of sequence items by index', () => {
    const result = loadDocument(
      ['tools:', '  - search', '  - lookup', ''].join('\n'),
      'agentform.yaml',
    );

    expect(result.value).toEqual({ tools: ['search', 'lookup'] });
    expect(result.sourceMap.get('tools.0')).toEqual({ file: 'agentform.yaml', line: 2, column: 5 });
    expect(result.sourceMap.get('tools.1')).toEqual({ file: 'agentform.yaml', line: 3, column: 5 });
  });

  it('reports a syntax error as a diagnostic instead of throwing', () => {
    const result = loadDocument(
      ['metadata:', '  name: "unterminated'].join('\n'),
      'agentform.yaml',
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.severity).toBe('error');
    expect(result.diagnostics[0]?.code).toBe('AGF1000');
    expect(result.diagnostics[0]?.location?.file).toBe('agentform.yaml');
  });

  it('rejects duplicate keys at the same level as a diagnostic', () => {
    const result = loadDocument(
      ['metadata:', '  name: a', '  name: b', ''].join('\n'),
      'agentform.yaml',
    );

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('loadDocument (JSON)', () => {
  it('parses JSON text identically to equivalent YAML', () => {
    const json = loadDocument(
      JSON.stringify({ metadata: { name: 'fixture-app', version: '1.0.0' } }),
      'agentform.json',
    );
    const yaml = loadDocument(
      ['metadata:', '  name: fixture-app', '  version: 1.0.0', ''].join('\n'),
      'agentform.yaml',
    );

    expect(json.value).toEqual(yaml.value);
    expect(json.diagnostics).toEqual([]);
  });
});
