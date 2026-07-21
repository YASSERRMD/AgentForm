import { isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { generateModelFile } from './generate-model.js';
import { multiAgentIR } from './test-fixtures.js';

function modelFromFixture(modelId: string) {
  const ir = multiAgentIR();
  const model = ir.models.get(modelId);
  if (!model) {
    throw new Error(`expected fixture to declare model "${modelId}"`);
  }
  return model;
}

describe('generateModelFile', () => {
  it('produces a build_<id>_client() factory function', () => {
    const source = generateModelFile('primary', modelFromFixture('primary'));
    expect(source).toContain('def build_primary_client() -> ChatCompletionClient:');
  });

  it('imports the real ChatCompletionClient type', () => {
    const source = generateModelFile('primary', modelFromFixture('primary'));
    expect(source).toContain('from autogen_core.models import ChatCompletionClient');
  });

  it('documents the declared provider and model in the docstring', () => {
    const source = generateModelFile('primary', modelFromFixture('primary'));
    expect(source).toContain('provider: openai, model: gpt-5');
  });

  it('never fabricates a real client — always a NotImplementedError stub, never a bare string', () => {
    const source = generateModelFile('primary', modelFromFixture('primary'));
    expect(source).toContain('raise NotImplementedError(');
    expect(source).not.toMatch(/return\s+['"]/);
  });

  it('produces syntactically valid Python', () => {
    const source = generateModelFile('primary', modelFromFixture('primary'));
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });
});
