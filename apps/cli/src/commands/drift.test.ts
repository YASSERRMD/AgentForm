import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function project(instructionsText: string, environment = 'development'): Record<string, string> {
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
      `    environment: ${environment}`,
      '  models:',
      '    primary:',
      '      provider: openai',
      '      model: gpt-5',
      '  agents:',
      '    assistant:',
      '      model: primary',
      '      role: assistant',
      '      instructions:',
      `        text: ${instructionsText}`,
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
}

let fixture: FixtureProject | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('agentform drift', () => {
  it('reports no drift immediately after a clean apply', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['drift'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No drift detected');
  });

  it('reports resource drift when the specification changes after apply, without --exit-code affecting the exit code', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('You are an extremely helpful assistant.')['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['drift'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Drift detected');
    expect(result.stdout).toContain('agent.assistant: update');
  });

  it('exits 12 (DRIFT_DETECTED) with --exit-code when drift exists', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('You are an extremely helpful assistant.')['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['drift', '--exit-code'], fixture.dir);
    expect(result.exitCode).toBe(12);
  });

  it('does not exit 12 with --exit-code when there is no drift', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['drift', '--exit-code'], fixture.dir);
    expect(result.exitCode).toBe(0);
  });

  it('detects environment drift', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.', 'development'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('You are a helpful assistant.', 'staging')['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['drift'], fixture.dir);
    expect(result.stdout).toContain('environment: "development" -> "staging"');
  });

  it('detects generated-artifact drift after the specification changes post-compile', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('You are an extremely helpful assistant.')['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['drift'], fixture.dir);
    expect(result.stdout).toContain('generated artifacts (openai)');
  });

  it('reports policy status alongside drift', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    const result = runCli(['drift'], fixture.dir);
    expect(result.stdout).toContain('Policy: PASSED');
  });

  it('produces parseable JSON output', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['drift', '--json'], fixture.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      hasDrift: boolean;
      resourceDrift: unknown[];
      policyStatus: string;
    };
    expect(parsed.success).toBe(true);
    expect(parsed.hasDrift).toBe(false);
    expect(parsed.resourceDrift).toEqual([]);
    expect(parsed.policyStatus).toBe('PASSED');
  });

  it('fails with the schema-validation exit code on an invalid document', () => {
    fixture = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['drift'], fixture.dir);
    expect(result.exitCode).toBe(4);
  });

  it('rejects an unknown --target with INVALID_USAGE (2)', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    const result = runCli(['drift', '--target', 'not-a-real-framework'], fixture.dir);
    expect(result.exitCode).toBe(2);
  });

  it('supports --help', () => {
    fixture = createFixtureProject(project('You are a helpful assistant.'));
    const result = runCli(['drift', '--help'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--exit-code');
  });
});
