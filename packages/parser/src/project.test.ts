import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInMemoryFileSystem } from './filesystem.js';
import { loadProject } from './project.js';

const rootDir = path.resolve('/project');

function fs(files: Record<string, string>) {
  const absolute: Record<string, string> = {};
  for (const [relative, contents] of Object.entries(files)) {
    absolute[path.join(rootDir, relative)] = contents;
  }
  return createInMemoryFileSystem(absolute);
}

describe('loadProject', () => {
  it('loads a single YAML file project with no diagnostics', () => {
    const result = loadProject({
      rootDir,
      fs: fs({
        'agentform.yaml': [
          'metadata:',
          '  name: basic',
          '  version: 1.0.0',
          'spec:',
          '  runtime:',
          '    target: openai',
          '    environment: development',
          '',
        ].join('\n'),
      }),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      metadata: { name: 'basic', version: '1.0.0' },
      spec: { runtime: { target: 'openai', environment: 'development' } },
    });
  });

  it('loads a single JSON file project equivalently', () => {
    const result = loadProject({
      rootDir,
      fs: fs({
        'agentform.json': JSON.stringify({
          metadata: { name: 'basic', version: '1.0.0' },
          spec: { runtime: { target: 'openai', environment: 'development' } },
        }),
      }),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      metadata: { name: 'basic', version: '1.0.0' },
      spec: { runtime: { target: 'openai', environment: 'development' } },
    });
  });

  it('reports an error when no entry file exists', () => {
    const result = loadProject({ rootDir, fs: fs({}) });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1001');
  });

  it('reports an error when more than one entry file exists', () => {
    const result = loadProject({
      rootDir,
      fs: fs({ 'agentform.yaml': 'metadata:\n  name: a\n', 'agentform.json': '{}' }),
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1005');
  });

  it('assembles a multi-file project: $ref plus auto-discovered agents/tools/workflows', () => {
    const result = loadProject({
      rootDir,
      fs: fs({
        'agentform.yaml': [
          'metadata:',
          '  name: research-assistant',
          '  version: 1.0.0',
          'spec:',
          '  runtime:',
          '    target: langgraph',
          '    environment: development',
          '  models:',
          '    primary:',
          '      provider: openai',
          '      model: gpt-5',
          '  agents:',
          '    researcher:',
          '      $ref: ./agents/researcher.yaml',
          '',
        ].join('\n'),
        'agents/researcher.yaml': 'model: primary\nrole: researcher\n',
        'agents/writer.yaml': 'model: primary\nrole: writer\n',
        'tools/search.yaml': 'type: mcp\nserver: search-service\noperation: search.query\n',
        'workflows/research.yaml': [
          'entrypoint: researcher',
          'nodes:',
          '  researcher:',
          '    type: agent',
          '    agent: researcher',
          '',
        ].join('\n'),
      }),
    });

    expect(result.diagnostics).toEqual([]);
    const value = result.value as { spec: Record<string, unknown> };
    expect(value.spec.agents).toEqual({
      researcher: { model: 'primary', role: 'researcher' },
      writer: { model: 'primary', role: 'writer' },
    });
    expect(value.spec.tools).toEqual({
      search: { type: 'mcp', server: 'search-service', operation: 'search.query' },
    });
    expect(value.spec.workflows).toEqual({
      research: {
        entrypoint: 'researcher',
        nodes: { researcher: { type: 'agent', agent: 'researcher' } },
      },
    });
  });

  it('reports a duplicate when an inline resource collides with an auto-discovered file', () => {
    const result = loadProject({
      rootDir,
      fs: fs({
        'agentform.yaml': [
          'metadata:',
          '  name: app',
          '  version: 1.0.0',
          'spec:',
          '  runtime:',
          '    target: openai',
          '    environment: development',
          '  agents:',
          '    researcher:',
          '      model: primary',
          '      role: inline-researcher',
          '',
        ].join('\n'),
        'agents/researcher.yaml': 'model: primary\nrole: file-researcher\n',
      }),
    });

    expect(result.diagnostics.some((d) => d.code === 'AGF1005')).toBe(true);
  });

  it('applies an environment overlay on top of the base document', () => {
    const result = loadProject({
      rootDir,
      environment: 'production',
      fs: fs({
        'agentform.yaml': [
          'metadata:',
          '  name: app',
          '  version: 1.0.0',
          'spec:',
          '  runtime:',
          '    target: openai',
          '    environment: development',
          '  models:',
          '    primary:',
          '      provider: openai',
          '      model: gpt-5',
          '      temperature: 1',
          '',
        ].join('\n'),
        'environments/production.yaml': [
          'spec:',
          '  runtime:',
          '    target: openai',
          '    environment: production',
          '  models:',
          '    primary:',
          '      temperature: 0',
          '',
        ].join('\n'),
      }),
    });

    expect(result.diagnostics).toEqual([]);
    const value = result.value as {
      spec: {
        runtime: { environment: string };
        models: { primary: { provider: string; temperature: number } };
      };
    };
    expect(value.spec.runtime.environment).toBe('production');
    expect(value.spec.models.primary.temperature).toBe(0);
    expect(value.spec.models.primary.provider).toBe('openai');
  });

  it('rejects a --environment value that resolves outside the project root, never reading the escaped file', () => {
    const canaryPath = path.join(path.dirname(rootDir), 'secret.yaml');
    const inMemoryFs = createInMemoryFileSystem({
      [path.join(rootDir, 'agentform.yaml')]: [
        'metadata:',
        '  name: app',
        '  version: 1.0.0',
        'spec:',
        '  runtime:',
        '    target: openai',
        '    environment: development',
        '',
      ].join('\n'),
      [canaryPath]: ['spec:', '  runtime:', '    environment: pwned', ''].join('\n'),
    });

    const result = loadProject({ rootDir, environment: '../../secret', fs: inMemoryFs });

    expect(result.diagnostics.some((d) => d.code === 'AGF1002')).toBe(true);
    // An unsafe --environment value fails the whole load (consistent with
    // every other error-diagnostic case in this file) — proving `value`
    // is undefined, not just "doesn't happen to contain the canary's
    // content", is what actually shows the escaped file was never read.
    expect(result.value).toBeUndefined();
  });

  it('resolves prompt files and interpolates env/var together with references', () => {
    const result = loadProject({
      rootDir,
      env: { COMPLAINT_API_URL: 'https://api.example.com' },
      fs: fs({
        'agentform.yaml': [
          'variables:',
          '  region:',
          '    default: us-east-1',
          'metadata:',
          '  name: app',
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
          '    intake:',
          '      $ref: ./agents/intake.yaml',
          '',
        ].join('\n'),
        'agents/intake.yaml': [
          'model: primary',
          'role: intake',
          'instructions:',
          '  file: ../prompts/intake.md',
          'metadata:',
          '  endpoint: ${env.COMPLAINT_API_URL}',
          '  region: ${var.region}',
          '',
        ].join('\n'),
        'prompts/intake.md': 'You are an intake agent for ${var.region}.',
      }),
    });

    expect(result.diagnostics).toEqual([]);
    const value = result.value as {
      spec: {
        agents: { intake: { instructions: { text: string }; metadata: Record<string, string> } };
      };
    };
    expect(value.spec.agents.intake.instructions.text).toBe(
      'You are an intake agent for us-east-1.',
    );
    expect(value.spec.agents.intake.metadata.endpoint).toBe('https://api.example.com');
    expect(value.spec.agents.intake.metadata.region).toBe('us-east-1');
  });

  it('surfaces YAML line/column diagnostics for a syntax error in the entry file', () => {
    const result = loadProject({
      rootDir,
      fs: fs({ 'agentform.yaml': 'metadata:\n  name: "unterminated\n' }),
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.location?.file).toBe('agentform.yaml');
    expect(result.diagnostics[0]?.location?.line).toBeGreaterThan(0);
  });
});
