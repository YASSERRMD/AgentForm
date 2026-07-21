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

  it('reports drift as unknown before anything has been applied', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Drift:         unknown (nothing has been applied yet)');
  });

  it('reports evaluation as not applicable when no datasets or thresholds are declared', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Evaluation:    not applicable');
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

function projectWithDataset(datasetContent: string): Record<string, string> {
  return {
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
      '    intake:',
      '      model: primary',
      '      role: intake',
      '      instructions:',
      '        text: Triage the request.',
      '  workflows:',
      '    main:',
      '      entrypoint: intake',
      '      nodes:',
      '        intake:',
      '          type: agent',
      '          agent: intake',
      '        done:',
      '          type: terminate',
      '          reason: complete',
      '      edges:',
      '        - from: intake',
      '          to: done',
      '  evaluations:',
      '    datasets:',
      '      - tests/basic.jsonl',
      '',
    ].join('\n'),
    'tests/basic.jsonl': datasetContent,
  };
}

const PASSING_DATASET = JSON.stringify({
  name: 'reaches the terminal node',
  workflow: 'main',
  assertions: [{ type: 'terminationReason', equals: 'complete' }],
});

const FAILING_DATASET = JSON.stringify({
  name: 'expects the wrong termination reason',
  workflow: 'main',
  assertions: [{ type: 'terminationReason', equals: 'something-else' }],
});

describe('agentform status — evaluation gate reporting', () => {
  it('reports never run when evaluations are declared but agentform test has never run', () => {
    project = createFixtureProject(projectWithDataset(PASSING_DATASET));
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Evaluation:    never run');
  });

  it('reports PASSED once agentform test has run and passed for the current specification', () => {
    project = createFixtureProject(projectWithDataset(PASSING_DATASET));
    expect(runCli(['test'], project.dir).exitCode).toBe(0);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Evaluation:    PASSED');
  });

  it('reports FAILED when the most recent run for the current specification did not pass', () => {
    project = createFixtureProject(projectWithDataset(FAILING_DATASET));
    expect(runCli(['test'], project.dir).exitCode).toBe(9);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Evaluation:    FAILED');
  });

  it('produces a parseable evaluationStatus field in --json output', () => {
    project = createFixtureProject(projectWithDataset(PASSING_DATASET));
    const result = runCli(['status', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as { status: { evaluationStatus: string } };
    expect(parsed.status.evaluationStatus).toContain('never run');
  });
});

describe('agentform status — drift reporting', () => {
  it('reports never checked immediately after an apply, before agentform drift has ever run', () => {
    project = createFixtureProject(VALID_PROJECT);
    expect(runCli(['apply', '--auto-approve'], project.dir).exitCode).toBe(0);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Drift:         never checked (run "agentform drift")');
  });

  it('reports in sync after agentform drift finds no drift', () => {
    project = createFixtureProject(VALID_PROJECT);
    expect(runCli(['apply', '--auto-approve'], project.dir).exitCode).toBe(0);
    expect(runCli(['drift'], project.dir).exitCode).toBe(0);
    const result = runCli(['status'], project.dir);
    expect(result.stdout).toContain('Drift:         in sync (checked at');
  });
});
