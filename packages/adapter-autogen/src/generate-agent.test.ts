import { isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { generateAgentFile } from './generate-agent.js';
import { multiAgentIR } from './test-fixtures.js';

function agentFromFixture(agentId: string) {
  const ir = multiAgentIR();
  const agent = ir.agents.get(agentId);
  if (!agent) {
    throw new Error(`expected fixture to declare agent "${agentId}"`);
  }
  return { ir, agent };
}

describe('generateAgentFile', () => {
  it('produces a build_<id>_agent() factory function, not a module-level constant', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('def build_intake_agent() -> AssistantAgent:');
    expect(source).not.toMatch(/^intake = AssistantAgent/m);
  });

  it('constructs a real AssistantAgent with name, model_client, system_message', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('name="intake"');
    expect(source).toContain('model_client=build_primary_client()');
    expect(source).toContain(
      'system_message="Triage the request and hand off to research when needed."',
    );
  });

  it('sanitizes a hyphenated delegation target into a valid Python identifier', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('handoffs=["research_specialist"]');
  });

  it('imports and lists declared tools', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('from ..tools.search_registry import search_registry');
    expect(source).toContain('tools=[search_registry]');
  });

  it('includes description when declared, omits it otherwise', () => {
    const intake = agentFromFixture('intake');
    expect(generateAgentFile('intake', intake.agent, intake.ir)).toContain(
      'description="Handles the first pass over an incoming request."',
    );
    const research = agentFromFixture('research-specialist');
    expect(generateAgentFile('research-specialist', research.agent, research.ir)).not.toContain(
      'description=',
    );
  });

  it('never fabricates a real model client inline — always imports the stub builder', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('from ..models.primary import build_primary_client');
  });

  it('produces syntactically valid Python', () => {
    const { ir, agent } = agentFromFixture('intake');
    const source = generateAgentFile('intake', agent, ir);
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });
});
