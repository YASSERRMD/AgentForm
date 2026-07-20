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

describe('agentform status', () => {
  it('reports application/environment/target and exits 0', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Application:   fixture-app');
    expect(result.stdout).toContain('Environment:   development');
    expect(result.stdout).toContain('Target:        openai');
  });

  it('reports never applied and zero resources before any apply exists', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Last apply:    never applied');
    expect(result.stdout).toContain('Resources:     0 tracked');
  });

  it('honestly reports drift and evaluation as not yet implemented', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Drift:         unknown');
    expect(result.stdout).toContain('Evaluation:    unknown');
  });

  it('reports policy status PASSED for a clean project', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Policy:        PASSED');
  });

  it('produces parseable JSON output', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      status: { application: string; policyStatus: string };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.status.application).toBe('fixture-app');
    expect(parsed.status.policyStatus).toBe('PASSED');
  });

  it('fails with exit code 4 (schema validation failure) on an invalid document', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['status'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('supports --help', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
  });
});
