import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function projectWithDataset(
  datasetFileName: string,
  datasetContent: string,
): Record<string, string> {
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
      `    datasets:`,
      `      - ${datasetFileName}`,
      '',
    ].join('\n'),
    [datasetFileName]: datasetContent,
  };
}

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform test', () => {
  it('exits 0 and reports a pass when every assertion in a passing dataset succeeds', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({
          name: 'reaches the terminal node',
          workflow: 'main',
          assertions: [
            { type: 'nodeVisited', node: 'intake' },
            { type: 'terminationReason', equals: 'complete' },
          ],
        }),
      ),
    );
    const result = runCli(['test'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
    expect(result.stdout).toContain('1 passed, 0 failed');
  });

  it('reports the dataset pass rate and exits 9 when a multi-case dataset has mixed results', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        [
          JSON.stringify({
            name: 'reaches the terminal node',
            workflow: 'main',
            assertions: [{ type: 'terminationReason', equals: 'complete' }],
          }),
          JSON.stringify({
            name: 'expects the wrong termination reason',
            workflow: 'main',
            assertions: [{ type: 'terminationReason', equals: 'something-else' }],
          }),
          JSON.stringify({
            name: 'checks the intake node was visited',
            workflow: 'main',
            assertions: [{ type: 'nodeVisited', node: 'intake' }],
          }),
        ].join('\n'),
      ),
    );
    const result = runCli(['test'], project.dir);
    expect(result.exitCode).toBe(9);
    expect(result.stdout).toContain('2 passed, 1 failed (3 total)');
  });

  it('exits 9 (TEST_FAILURE) and names the failing assertion when a dataset fails', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({
          name: 'expects the wrong termination reason',
          workflow: 'main',
          assertions: [{ type: 'terminationReason', equals: 'something-else' }],
        }),
      ),
    );
    const result = runCli(['test'], project.dir);
    expect(result.exitCode).toBe(9);
    expect(result.stdout).toContain('FAIL');
    expect(result.stdout).toContain('terminationReason');
  });

  it('reports no test cases and exits 0 when no datasets are declared', () => {
    project = createFixtureProject({
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
        '      edges:',
        '        - from: intake',
        '          to: done',
        '',
      ].join('\n'),
    });
    const result = runCli(['test'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No test cases to run');
  });

  it('writes a JUnit XML report with --junit', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({
          name: 'reaches the terminal node',
          workflow: 'main',
          assertions: [{ type: 'nodeVisited', node: 'intake' }],
        }),
      ),
    );
    const junitPath = path.join(project.dir, 'results.xml');
    const result = runCli(['test', '--junit', junitPath], project.dir);
    expect(result.exitCode).toBe(0);
    const xml = readFileSync(junitPath, 'utf-8');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('reaches the terminal node');
  });

  it('produces parseable JSON output with --json', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({
          name: 'reaches the terminal node',
          workflow: 'main',
          assertions: [{ type: 'nodeVisited', node: 'intake' }],
        }),
      ),
    );
    const result = runCli(['test', '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { success: boolean; results: unknown[] };
    expect(parsed.success).toBe(true);
    expect(parsed.results).toHaveLength(1);
  });

  it('rejects --live with a clear, non-crashing message (not yet implemented)', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({ name: 'x', workflow: 'main', assertions: [] }),
      ),
    );
    const result = runCli(['test', '--live'], project.dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('not yet implemented');
  });

  it('fails with the schema-validation exit code when the project itself is invalid', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['test'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('supports --help', () => {
    project = createFixtureProject(
      projectWithDataset(
        'tests/basic.jsonl',
        JSON.stringify({ name: 'x', workflow: 'main', assertions: [] }),
      ),
    );
    const result = runCli(['test', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--junit');
  });
});
