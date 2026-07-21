import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectOpenAiAgentsProject } from './inspect-existing.js';

function tempProject(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentform-openai-import-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
  return dir;
}

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('inspectOpenAiAgentsProject', () => {
  it('does not recognize a project with no OpenAI Agents SDK signal', async () => {
    dir = tempProject({ 'main.py': 'print("hello world")' });
    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.recognized).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('recognizes a TypeScript project and recovers agent name/instructions/model', async () => {
    dir = tempProject({
      'src/agent.ts': [
        "import { Agent } from '@openai/agents';",
        '',
        'export const triageAgent = new Agent({',
        "  name: 'Triage Agent',",
        "  instructions: 'Route the user to the right specialist.',",
        "  model: 'gpt-4o',",
        '});',
        '',
      ].join('\n'),
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.recognized).toBe(true);

    const agent = result.candidates.find((c) => c.kind === 'agent');
    expect(agent?.resourceAddress).toBe('agent.Triage_Agent');
    expect(agent?.value).toMatchObject({
      role: 'assistant',
      instructions: { text: 'Route the user to the right specialist.' },
      model: 'gpt_4o',
    });
    expect(agent?.confidence).toBeGreaterThan(0);
    expect(agent?.confidence).toBeLessThanOrEqual(1);

    const model = result.candidates.find((c) => c.kind === 'model');
    expect(model?.value).toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('recognizes a Python project using kwargs syntax', async () => {
    dir = tempProject({
      'main.py': [
        'from agents import Agent, Runner',
        '',
        'triage_agent = Agent(',
        '    name="Triage Agent",',
        '    instructions="Route the user to the right specialist.",',
        '    model="gpt-4o",',
        ')',
        '',
      ].join('\n'),
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.recognized).toBe(true);
    const agent = result.candidates.find((c) => c.kind === 'agent');
    expect(agent?.value).toMatchObject({
      instructions: { text: 'Route the user to the right specialist.' },
    });
  });

  it('recognizes TypeScript tool() calls and Python @function_tool decorators', async () => {
    dir = tempProject({
      'src/tools.ts': [
        "import { tool } from '@openai/agents';",
        '',
        'export const search = tool({',
        "  name: 'web_search',",
        "  description: 'Search the web',",
        '});',
        '',
      ].join('\n'),
      'tools.py': [
        'from agents import function_tool',
        '',
        '@function_tool',
        'def get_weather(city: str) -> str:',
        '    return "sunny"',
        '',
      ].join('\n'),
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    const toolAddresses = result.candidates
      .filter((c) => c.kind === 'tool')
      .map((c) => c.resourceAddress);
    expect(toolAddresses).toContain('tool.web_search');
    expect(toolAddresses).toContain('tool.get_weather');
  });

  it('produces a placeholder instructions field and lower confidence when nothing was recovered', async () => {
    dir = tempProject({
      'src/agent.ts': [
        "import { Agent } from '@openai/agents';",
        'export const a = new Agent({});',
        '',
      ].join('\n'),
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    const agent = result.candidates.find((c) => c.kind === 'agent');
    expect((agent?.value.instructions as { text: string }).text).toContain('TODO');
    expect(agent?.confidence).toBeLessThan(0.5);
  });

  it('deduplicates agents with the same recovered name across files', async () => {
    dir = tempProject({
      'a.ts': "new Agent({ name: 'Shared', instructions: 'x' });",
      'b.ts': "new Agent({ name: 'Shared', instructions: 'x' });",
      'signal.ts': "import { Agent } from '@openai/agents';",
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.candidates.filter((c) => c.kind === 'agent')).toHaveLength(1);
  });

  it('does not match a class inheriting from Agent as a call site', async () => {
    dir = tempProject({
      'main.py': ['from agents import Agent', '', 'class TriageAgent(Agent):', '    pass', ''].join(
        '\n',
      ),
    });

    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.candidates.filter((c) => c.kind === 'agent')).toEqual([]);
  });

  it('always reports unsupported constructs and manual actions when recognized', async () => {
    dir = tempProject({
      'a.ts': "import { Agent } from '@openai/agents';\nnew Agent({ name: 'x' });",
    });
    const result = await inspectOpenAiAgentsProject({ rootDir: dir });
    expect(result.unsupportedConstructs.length).toBeGreaterThan(0);
    expect(result.manualActions.length).toBeGreaterThan(0);
  });
});
