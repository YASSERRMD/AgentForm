import { isSyntacticallyValidPython } from '@agentform/compiler';
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
  it('produces a plain type-hinted function named after the tool id', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(source).toContain('def search_registry(query: str) -> Any:');
    expect(source).not.toContain('@tool');
  });

  it('never fabricates real tool logic — always a NotImplementedError stub', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(source).toContain('raise NotImplementedError(');
  });

  it('falls back to **kwargs: Any when the tool has no inputSchema', () => {
    const source = generateToolFile('no-schema-tool', {
      type: 'function',
      handler: 'noop.ts#run',
    } as never);
    expect(source).toContain('def no_schema_tool(**kwargs: Any) -> Any:');
  });

  it('produces syntactically valid Python', () => {
    const source = generateToolFile('search-registry', toolFromFixture('search-registry'));
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });
});
