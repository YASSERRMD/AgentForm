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
    expect(source).toContain('def build_intake_agent() -> Agent:');
    expect(source).not.toMatch(/^intake = Agent/m);
  });

  it('maps role directly and instructions.text to goal, with description (or a fallback) as backstory', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('role="intake"');
    expect(source).toContain('goal="Triage the request and hand off to research when needed."');
    expect(source).toContain('backstory="Handles the first pass over an incoming request."');
  });

  it('falls back to a neutral backstory when the agent has no description', () => {
    const ir = baseIR();
    const source = generateAgentFile('assistant', agentFromFixture(ir, 'assistant'), ir);
    expect(source).toContain(
      'backstory="An AI agent generated from the Agentform specification for \\"assistant\\"."',
    );
  });

  it('formats llm= as "<provider>/<model>", never a bare model string', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('llm="openai/gpt-5"');
  });

  it('emits no TODO comment for a provider verified to work without extras', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).not.toContain('TODO');
  });

  it('flags a provider outside the verified-safe set with an extras-install TODO, but still passes through the real value', () => {
    const ir = multiAgentIR();
    const intake = agentFromFixture(ir, 'intake');
    const mutatedModels = new Map(ir.models);
    mutatedModels.set('primary', { ...ir.models.get('primary')!, provider: 'anthropic' });
    const mutatedIr = { ...ir, models: mutatedModels };
    const source = generateAgentFile('intake', intake, mutatedIr);
    expect(source).toContain('llm="anthropic/gpt-5"');
    expect(source).toContain('# TODO: provider "anthropic" may need a matching CrewAI extra');
  });

  it('sets allow_delegation=True with a scoping-caveat comment when delegation is declared', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('allow_delegation=True');
    expect(source).toContain("CrewAI's delegation is crew-wide");
  });

  it('omits allow_delegation entirely when no delegation is declared', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile(
      'research-specialist',
      agentFromFixture(ir, 'research-specialist'),
      ir,
    );
    expect(source).not.toContain('allow_delegation');
  });

  it('imports and lists declared tools', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('from ..tools.search_registry import search_registry');
    expect(source).toContain('tools=[search_registry]');
  });

  it('produces syntactically valid Python', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });
});
