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
  it('produces a static class exposing a Build() factory, not a module-level constant', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('public static class IntakeAgent');
    expect(source).toContain('public static AIAgent Build()');
  });

  it('maps instructions.text, name, and description directly onto AsAIAgent named parameters', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain(
      'instructions: "Triage the request and hand off to research when needed."',
    );
    expect(source).toContain('name: "intake"');
    expect(source).toContain('description: "Handles the first pass over an incoming request."');
  });

  it("uses the unmodified hyphenated agent id for name:, unlike AutoGen/ADK's identifier constraint", () => {
    const ir = multiAgentIR();
    const source = generateAgentFile(
      'research-specialist',
      agentFromFixture(ir, 'research-specialist'),
      ir,
    );
    expect(source).toContain('name: "research-specialist"');
  });

  it('omits description: entirely when the agent has none', () => {
    const ir = baseIR();
    const source = generateAgentFile('assistant', agentFromFixture(ir, 'assistant'), ir);
    expect(source).not.toContain('description:');
  });

  it('routes model construction through the model stub factory', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('using GeneratedApp.Models;');
    expect(source).toContain('IChatClient chatClient = PrimaryModel.BuildChatClient();');
    expect(source).toContain('chatClient.AsAIAgent(');
  });

  it('imports and lists declared tools', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile('intake', agentFromFixture(ir, 'intake'), ir);
    expect(source).toContain('using GeneratedApp.Tools;');
    expect(source).toContain('tools: [SearchRegistryTool.AsAIFunction()]');
  });

  it('omits tools: entirely when the agent has none', () => {
    const ir = multiAgentIR();
    const source = generateAgentFile(
      'research-specialist',
      agentFromFixture(ir, 'research-specialist'),
      ir,
    );
    expect(source).not.toContain('tools:');
    expect(source).not.toContain('using GeneratedApp.Tools;');
  });
});
