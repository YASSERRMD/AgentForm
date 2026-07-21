import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const VALID_PROJECT_PRODUCTION_NO_EVALUATIONS = {
  'agentform.yaml': [
    'apiVersion: agentform.dev/v1alpha1',
    'kind: AgenticApplication',
    'metadata:',
    '  name: fixture-app',
    '  version: 1.0.0',
    'spec:',
    '  runtime:',
    '    target: openai',
    '    environment: production',
    '  models:',
    '    primary:',
    '      provider: openai',
    '      model: gpt-5',
    '      version: 2026-01-01',
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

function evaluationsYaml(
  environment: string,
  instructionsText: string,
  datasetFileName: string,
): string {
  return [
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
    '      version: 2026-01-01',
    '  agents:',
    '    intake:',
    '      model: primary',
    '      role: intake',
    '      instructions:',
    `        text: ${instructionsText}`,
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
    `      - ${datasetFileName}`,
    '    thresholds:',
    '      taskSuccess: 0.5',
    '',
  ].join('\n');
}

function projectWithEvaluations(
  environment: string,
  instructionsText: string,
  datasetFileName: string,
  datasetContent: string,
): Record<string, string> {
  return {
    'agentform.yaml': evaluationsYaml(environment, instructionsText, datasetFileName),
    [datasetFileName]: datasetContent,
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

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform plan', () => {
  it('plans CREATE for every resource against empty state, exit 0', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('model.primary will be created');
    expect(result.stdout).toContain('agent.assistant will be created');
    expect(result.stdout).toContain('workflow.main will be created');
    expect(result.stdout).toContain('Plan: 3 to create, 0 to change, 0 to destroy.');
    expect(result.stdout).toContain('Policy result: PASSED');
  });

  it('orders dependencies correctly in the printed plan (model before agent before workflow)', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['plan'], project.dir);
    const modelIndex = result.stdout.indexOf('model.primary will be created');
    const agentIndex = result.stdout.indexOf('agent.assistant will be created');
    const workflowIndex = result.stdout.indexOf('workflow.main will be created');
    expect(modelIndex).toBeLessThan(agentIndex);
    expect(agentIndex).toBeLessThan(workflowIndex);
  });

  it('produces parseable JSON output with items and policyResults', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['plan', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      items: { resourceAddress: string; operation: string }[];
      policyResults: { policyId: string }[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.policyResults).toHaveLength(15);
  });

  it('fails with exit code 4 (schema validation failure) on an invalid document', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('fails with exit code 6 (policy failure) on an ungated destructive tool', () => {
    project = createFixtureProject(WITH_UNGATED_DESTRUCTIVE_TOOL);
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(6);
    expect(result.stdout).toContain('AF004');
    expect(result.stdout).toContain('Policy result: FAILED');
    expect(result.stdout).toContain('Critical changes require explicit approval.');
  });

  it('saves a verifiable .afplan file with --out', () => {
    project = createFixtureProject(VALID_PROJECT);
    const outPath = path.join(project.dir, 'plan.afplan');
    const result = runCli(['plan', '--out', outPath], project.dir);
    expect(result.exitCode).toBe(0);

    const saved = JSON.parse(readFileSync(outPath, 'utf-8')) as {
      formatVersion: string;
      contentHash: string;
      items: unknown[];
    };
    expect(saved.formatVersion).toBe('1');
    expect(saved.items).toHaveLength(3);
    expect(saved.contentHash).toMatch(/^sha256:/);
  });

  it('never mutates state: running plan twice reports CREATE both times', () => {
    project = createFixtureProject(VALID_PROJECT);
    const first = runCli(['plan'], project.dir);
    const second = runCli(['plan'], project.dir);
    expect(first.stdout).toContain('Plan: 3 to create, 0 to change, 0 to destroy.');
    expect(second.stdout).toContain('Plan: 3 to create, 0 to change, 0 to destroy.');
  });

  it('supports --help', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['plan', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--out');
  });
});

describe('agentform plan — evaluation gate diagnostics', () => {
  it('warns AGF6001 when a production environment declares evaluations but agentform test has never run', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'production',
        'Triage the request.',
        'tests/basic.jsonl',
        PASSING_DATASET,
      ),
    );
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('AGF6001');
  });

  it('reports nothing once agentform test has run and passed for the current specification', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'production',
        'Triage the request.',
        'tests/basic.jsonl',
        PASSING_DATASET,
      ),
    );
    expect(runCli(['test'], project.dir).exitCode).toBe(0);

    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('AGF6');
  });

  it('warns AGF6003 when the most recent run for the current specification did not pass', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'production',
        'Triage the request.',
        'tests/basic.jsonl',
        FAILING_DATASET,
      ),
    );
    expect(runCli(['test'], project.dir).exitCode).toBe(9);

    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('AGF6003');
  });

  it('warns AGF6002 when the specification has changed since agentform test last ran', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'production',
        'Triage the request.',
        'tests/basic.jsonl',
        PASSING_DATASET,
      ),
    );
    expect(runCli(['test'], project.dir).exitCode).toBe(0);

    const changedYaml = evaluationsYaml(
      'production',
      'Triage the request with extra care.',
      'tests/basic.jsonl',
    );
    writeFileSync(path.join(project.dir, 'agentform.yaml'), changedYaml, 'utf-8');

    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('AGF6002');
  });

  it('never blocks the plan exit code — evaluation gate diagnostics are warnings, not errors', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'production',
        'Triage the request.',
        'tests/basic.jsonl',
        PASSING_DATASET,
      ),
    );
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
  });

  it('stays silent in a non-production environment even when agentform test has never run', () => {
    project = createFixtureProject(
      projectWithEvaluations(
        'development',
        'Triage the request.',
        'tests/basic.jsonl',
        PASSING_DATASET,
      ),
    );
    const result = runCli(['plan'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('AGF6');
  });

  it('stays silent in production when no evaluations are declared at all (AF008 already covers that case)', () => {
    project = createFixtureProject(VALID_PROJECT_PRODUCTION_NO_EVALUATIONS);
    const result = runCli(['plan'], project.dir);
    expect(result.stdout).toContain('AF008');
    expect(result.stdout).not.toContain('AGF6');
  });
});
