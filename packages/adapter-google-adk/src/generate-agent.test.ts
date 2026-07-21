import { isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { generateAgentFile } from './generate-agent.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';

function agentFromFixture(ir: ReturnType<typeof baseIR>, agentId: string) {
  const agent = ir.agents.get(agentId);
  if (!agent) {
    throw new Error(`expected fixture to declare agent "${agentId}"`);
  }
  return agent;
}

describe('generateAgentFile', () => {
  it('produces a build_<id>_agent() factory function, not a module-level constant', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('def build_intake_agent() -> LlmAgent:');
    expect(source).not.toMatch(/^intake = LlmAgent/m);
  });

  it('inlines a Google-provider model string directly, with no TODO comment', () => {
    const ir = baseIR();
    const source = generateAgentFile('assistant', agentFromFixture(ir, 'assistant'), ir);
    expect(source).toContain('model="gemini-flash-latest"');
    expect(source).not.toContain('TODO');
  });

  it('flags a non-Google provider model with a verification TODO comment, but still passes through the real value', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('model="gpt-5"');
    expect(source).toContain('# TODO: verify this model identifier is valid for provider "openai"');
  });

  it('constructs sub_agents from delegation targets via their factory functions', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain(
      'from ..agents.research_specialist import build_research_specialist_agent',
    );
    expect(source).toContain('sub_agents=[build_research_specialist_agent()]');
  });

  it('imports and lists declared tools', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('from ..tools.search_registry import search_registry');
    expect(source).toContain('tools=[search_registry]');
  });

  it('uses instruction= for the system prompt', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain(
      'instruction="Triage the request and hand off to research when needed."',
    );
  });

  it('produces syntactically valid Python', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });
});
