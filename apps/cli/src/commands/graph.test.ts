import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

const BRANCHING_PROJECT = {
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
    '        approve:',
    '          type: humanApproval',
    '        done:',
    '          type: terminate',
    '      edges:',
    '        - from: assistant',
    '          to: approve',
    '          when: output.confidence < 0.85',
    '        - from: assistant',
    '          to: done',
    '          when: output.confidence >= 0.85',
    '        - from: approve',
    '          to: done',
    '',
  ].join('\n'),
};

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform graph', () => {
  it('renders valid mermaid text by default', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('flowchart TD');
    expect(result.stdout).toContain('assistant(["assistant (agent)"])');
    expect(result.stdout).toContain('assistant -->|"output.confidence < 0.85"| approve');
  });

  it('renders valid DOT text with --format dot', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph', '--format', 'dot'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('digraph "main" {');
    expect(result.stdout.trim().endsWith('}')).toBe(true);
  });

  it('renders parseable JSON with --format json', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph', '--format', 'json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { workflow: string; entrypoint: string };
    expect(parsed.workflow).toBe('main');
    expect(parsed.entrypoint).toBe('assistant');
  });

  it('writes to a file with --output instead of stdout', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const outputPath = path.join(project.dir, 'workflow.mmd');
    const result = runCli(['graph', '--output', outputPath], project.dir);
    expect(result.exitCode).toBe(0);
    const written = readFileSync(outputPath, 'utf-8');
    expect(written).toContain('flowchart TD');
  });

  it('rejects an unknown --format with INVALID_USAGE (2)', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph', '--format', 'svg'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('rejects an unknown --workflow with INVALID_USAGE (2)', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph', '--workflow', 'does-not-exist'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('fails with the schema-validation exit code on an invalid project', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['graph'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('supports --help', () => {
    project = createFixtureProject(BRANCHING_PROJECT);
    const result = runCli(['graph', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--format');
  });
});
