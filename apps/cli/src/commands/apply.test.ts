import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function projectWithWorkflow(): Record<string, string> {
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
}

function projectWithoutWorkflow(): Record<string, string> {
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
      '    assistant:',
      '      model: primary',
      '      role: assistant',
      '      instructions:',
      '        text: You are a helpful assistant.',
      '  workflows: {}',
      '',
    ].join('\n'),
  };
}

const WITH_UNGATED_DESTRUCTIVE_TOOL = {
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
    '  tools:',
    '    wipeDb:',
    '      type: function',
    '      handler: db.ts#wipe',
    '      sideEffect: destructive',
    '      permissions: [db:wipe]',
    '      idempotencyStrategy: no-op if already empty',
    '      timeout: 30s',
    '  agents:',
    '    assistant:',
    '      model: primary',
    '      role: assistant',
    '      instructions:',
    '        text: You are a helpful assistant.',
    '      tools: [wipeDb]',
    '  workflows:',
    '    main:',
    '      entrypoint: assistant',
    '      nodes:',
    '        assistant:',
    '          type: agent',
    '          agent: assistant',
    '        wipe:',
    '          type: tool',
    '          tool: wipeDb',
    '      edges:',
    '        - from: assistant',
    '          to: wipe',
    '',
  ].join('\n'),
};

function projectWithFailingDataset(): Record<string, string> {
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
    'tests/basic.jsonl': JSON.stringify({
      name: 'expects the wrong termination reason',
      workflow: 'main',
      assertions: [{ type: 'terminationReason', equals: 'something-else' }],
    }),
  };
}

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform apply', () => {
  it('applies a clean project end to end: generates artifacts and persists resource state', () => {
    project = createFixtureProject(projectWithWorkflow());
    const result = runCli(['apply', '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Apply complete');
    expect(existsSync(path.join(project.dir, 'generated', 'openai', 'manifest.json'))).toBe(true);

    const plan = runCli(['plan'], project.dir);
    expect(plan.stdout).toContain('No changes. The deployed state matches the specification.');

    const status = runCli(['status'], project.dir);
    expect(status.stdout).toContain('Last apply:    succeeded');
    expect(status.stdout).toContain('Resources:     3 tracked');
  });

  it('reports no changes and exits 0 on a second apply with nothing to do', () => {
    project = createFixtureProject(projectWithWorkflow());
    expect(runCli(['apply', '--auto-approve'], project.dir).exitCode).toBe(0);
    const second = runCli(['apply', '--auto-approve'], project.dir);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('No changes. The deployed state matches the specification.');
  });

  it('fails with exit code 6 (policy failure) on an ungated destructive tool, even with --auto-approve', () => {
    project = createFixtureProject(WITH_UNGATED_DESTRUCTIVE_TOOL);
    const result = runCli(['apply', '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(6);
    expect(result.stdout).toContain('AF004');

    // no resources were persisted — a blocked apply changes nothing
    expect(runCli(['status'], project.dir).stdout).toContain('Resources:     0 tracked');
  });

  it('exits 7 (unapproved critical change) for a non-interactive critical change without --auto-approve', () => {
    project = createFixtureProject(projectWithWorkflow());
    expect(runCli(['apply', '--auto-approve'], project.dir).exitCode).toBe(0);

    // Removing the workflow makes it a DELETE — a workflow deletion is
    // always CRITICAL risk, independent of policy.
    writeFileSync(
      path.join(project.dir, 'agentform.yaml'),
      projectWithoutWorkflow()['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['apply'], project.dir);
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain('CRITICAL');

    // still 3 tracked resources — the unapproved apply changed nothing
    expect(runCli(['status'], project.dir).stdout).toContain('Resources:     3 tracked');
  });

  it('applies a critical change with --auto-approve', () => {
    project = createFixtureProject(projectWithWorkflow());
    expect(runCli(['apply', '--auto-approve'], project.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(project.dir, 'agentform.yaml'),
      projectWithoutWorkflow()['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['apply', '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(runCli(['status'], project.dir).stdout).toContain('Resources:     2 tracked');
  });

  it('fails with exit code 9 (test failure) when a smoke-test dataset fails, persisting nothing and releasing the lock', () => {
    project = createFixtureProject(projectWithFailingDataset());
    const result = runCli(['apply', '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(9);
    expect(result.stdout).toContain('Smoke tests failed');

    // nothing was persisted — smoke tests run before state is written —
    // but the apply IS recorded, correctly marked failed, not left
    // dangling as in_progress (recordApplyStart already committed before
    // the smoke-test step ran)
    const status = runCli(['status'], project.dir);
    expect(status.stdout).toContain('Resources:     0 tracked');
    expect(status.stdout).toContain('Last apply:    failed at');

    // the lock was released even though apply failed — a follow-up
    // command against the same project works immediately, no contention
    const followUp = runCli(['status'], project.dir);
    expect(followUp.exitCode).toBe(0);
  });

  it('rejects a stale saved plan (specification changed since the plan was made)', () => {
    project = createFixtureProject(projectWithWorkflow());
    const planPath = path.join(project.dir, 'saved.afplan');
    expect(runCli(['plan', '--out', planPath], project.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(project.dir, 'agentform.yaml'),
      projectWithoutWorkflow()['agentform.yaml']!,
      'utf-8',
    );

    const result = runCli(['apply', planPath, '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toContain('stale');
  });

  it('applies a fresh saved plan successfully', () => {
    project = createFixtureProject(projectWithWorkflow());
    const planPath = path.join(project.dir, 'saved.afplan');
    expect(runCli(['plan', '--out', planPath], project.dir).exitCode).toBe(0);

    const result = runCli(['apply', planPath, '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(runCli(['status'], project.dir).stdout).toContain('Resources:     3 tracked');
  });

  it('rejects a tampered saved plan file', () => {
    project = createFixtureProject(projectWithWorkflow());
    const planPath = path.join(project.dir, 'saved.afplan');
    runCli(['plan', '--out', planPath], project.dir);
    const tampered = readFileSync(planPath, 'utf-8').replace('"CREATE"', '"DELETE"');
    writeFileSync(planPath, tampered, 'utf-8');

    const result = runCli(['apply', planPath, '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toMatch(/tamper|hash/);
  });

  it('fails with exit code 4 (schema validation failure) on an invalid document', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['apply', '--auto-approve'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('rejects an unknown --target with INVALID_USAGE (2)', () => {
    project = createFixtureProject(projectWithWorkflow());
    const result = runCli(
      ['apply', '--target', 'not-a-real-framework', '--auto-approve'],
      project.dir,
    );
    expect(result.exitCode).toBe(2);
  });

  it('produces parseable JSON output on success', () => {
    project = createFixtureProject(projectWithWorkflow());
    const result = runCli(['apply', '--auto-approve', '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      applyId: string;
      filesWritten: number;
    };
    expect(parsed.success).toBe(true);
    expect(parsed.applyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.filesWritten).toBeGreaterThan(0);
  });

  it('supports --help', () => {
    project = createFixtureProject(projectWithWorkflow());
    const result = runCli(['apply', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--auto-approve');
  });
});
