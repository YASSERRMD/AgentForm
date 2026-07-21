import { describe, expect, it } from 'vitest';
import { generateToolFile } from './generate-tool.js';
import { multiAgentIR } from './test-fixtures.js';

function toolFromFixture(toolId: string) {
  const ir = multiAgentIR();
  const tool = ir.tools.get(toolId);
  if (!tool) {
    throw new Error(`expected fixture to declare tool "${toolId}"`);
  }
  return tool;
}

describe('generateToolFile', () => {
  it('produces a static class exposing AsAIFunction() and a typed Run() stub', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(source).toContain('public static class SearchRegistryTool');
    expect(source).toContain('using Microsoft.Extensions.AI;');
    expect(source).toContain('public static AIFunction AsAIFunction() =>');
    expect(source).toContain('AIFunctionFactory.Create(Run, name: "search_registry"');
    expect(source).toContain('public static object Run(string query)');
  });

  it('never fabricates real tool logic — always a NotImplementedException stub', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(source).toContain('throw new NotImplementedException(');
  });

  it('falls back to an empty parameter list when the tool has no inputSchema', () => {
    const source = generateToolFile('no-schema-tool', {
      type: 'function',
      handler: 'noop.ts#run',
    } as never);
    expect(source).toContain('public static object Run()');
  });

  it('uses the same snake_case tool name convention as the Python-targeting adapters', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(source).toContain('name: "search_registry"');
  });
});
