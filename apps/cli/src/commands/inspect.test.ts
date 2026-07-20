import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

const VALID_PROJECT = {
  'agentform.yaml': [
    'apiVersion: agentform.dev/v1alpha1',
    'kind: AgenticApplication',
    'metadata:',
    '  name: fixture-app',
    '  version: 1.0.0',
    'spec:',
    '  runtime:',
    '    target: openai',
    '    environment: development',
    '  models:',
    '    primary:',
    '      provider: openai',
    '      model: gpt-5',
    '  agents:',
    '    assistant:',
    '      model: primary',
    '      role: assistant',
    '      instructions:',
    '        text: You are a helpful assistant.',
    '  workflows:',
    '    main:',
    '      entrypoint: assistant',
    '      nodes:',
    '        assistant:',
    '          type: agent',
    '          agent: assistant',
    '',
  ].join('\n'),
};

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform inspect', () => {
  it('prints an application summary with resource counts when no address is given', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { resourceCounts: Record<string, number> };
    expect(parsed.resourceCounts).toEqual({
      models: 1,
      tools: 0,
      agents: 1,
      workflows: 1,
      memory: 0,
      outputs: 0,
      policies: 0,
    });
  });

  it('prints a specific resolved resource by address', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'agent.assistant', '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { model: string; role: string };
    expect(parsed.model).toBe('primary');
    expect(parsed.role).toBe('assistant');
  });

  it('resolves a model resource address, including IR-normalized defaults', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'model.primary', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      provider: string;
      model: string;
      fallbacks: unknown[];
      capabilities: unknown[];
    };
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-5');
    // buildIR() normalizes optional array fields to [] rather than leaving
    // them undefined (see docs/adr/0005) — visible end-to-end here.
    expect(parsed.fallbacks).toEqual([]);
    expect(parsed.capabilities).toEqual([]);
  });

  it('resolves a workflow resource address, including nested nodes/edges as plain objects', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'workflow.main', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      entrypoint: string;
      nodes: Record<string, unknown>;
    };
    expect(parsed.entrypoint).toBe('assistant');
    expect(parsed.nodes.assistant).toEqual({ type: 'agent', agent: 'assistant' });
  });

  it('prints readable (non-JSON) YAML-style output by default', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'agent.assistant'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('model: primary');
    expect(result.stdout.trim().startsWith('{')).toBe(false);
  });

  it('exits with INVALID_USAGE (2) for an unknown resource address', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'agent.does-not-exist'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('exits with INVALID_USAGE (2) for a malformed address with no dot', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', 'not-an-address'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('fails with the schema-validation exit code on an invalid project', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['inspect'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('supports --help', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['inspect', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('address');
  });
});
