import { describe, expect, it } from 'vitest';
import { generateAgentFile } from './generate-agent.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';
import { isSyntacticallyValidTypeScript } from './test-syntax-check.js';

describe('generateAgentFile', () => {
  it('produces syntactically valid TypeScript for a minimal agent', () => {
    const ir = baseIR();
    const agent = ir.agents.get('assistant');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('assistant', agent, ir);
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
    expect(source).toContain("import { Agent } from '@openai/agents';");
    expect(source).toContain('export const assistant = new Agent({');
  });

  it('produces syntactically valid TypeScript for a richly configured agent', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('intake');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('intake', agent, ir);
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
  });

  it('wires model settings from the referenced model', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('intake');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('"gpt-5"');
    expect(source).toContain('temperature: 0.2');
    expect(source).toContain('maxTokens: 2048');
  });

  it('imports and references its tools', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('intake');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain("from '../tools/search_registry.js'");
    expect(source).toContain('tools: [search_registry]');
  });

  it('imports and references its delegation handoffs', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('intake');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain("from './research_specialist.js'");
    expect(source).toContain('handoffs: [research_specialist]');
  });

  it('generates structured outputType from the agent outputSchema', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('intake');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('intake', agent, ir);
    expect(source).toContain('outputType: z.object({');
    expect(source).toContain('"summary": z.string()');
  });

  it('an agent with no tools/handoffs/guardrails/outputSchema omits those fields entirely', () => {
    const ir = multiAgentIR();
    const agent = ir.agents.get('research-specialist');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('research-specialist', agent, ir);
    expect(source).not.toContain('tools:');
    expect(source).not.toContain('handoffs:');
    expect(source).not.toContain('outputType:');
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
  });

  it('never includes a timestamp', () => {
    const ir = baseIR();
    const agent = ir.agents.get('assistant');
    if (!agent) throw new Error('missing fixture agent');
    const source = generateAgentFile('assistant', agent, ir);
    expect(source).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
