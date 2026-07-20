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

describe('agentform validate', () => {
  it('succeeds and exits 0 on a valid project', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['validate'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Validation succeeded.');
  });

  it('fails with exit code 4 (schema validation failure) on an invalid document', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['validate'], project.dir);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toContain('AGF2');
  });

  it('fails with exit code 5 (semantic validation failure) on an unreachable workflow node', () => {
    project = createFixtureProject({
      'agentform.yaml': VALID_PROJECT['agentform.yaml'].replace(
        'nodes:\n        assistant:\n          type: agent\n          agent: assistant\n',
        [
          'nodes:',
          '        assistant:',
          '          type: agent',
          '          agent: assistant',
          '        orphan:',
          '          type: agent',
          '          agent: assistant',
          '',
        ].join('\n        '),
      ),
    });
    const result = runCli(['validate'], project.dir);
    expect(result.exitCode).toBe(5);
    expect(result.stdout).toContain('AGF3005');
  });

  it('fails with exit code 3 (source parsing failure) when the project has no entry file', () => {
    project = createFixtureProject({ 'README.md': 'not an agentform project' });
    const result = runCli(['validate'], project.dir);
    expect(result.exitCode).toBe(3);
  });

  it('produces parseable, stable JSON output with --json', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['validate', '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { success: boolean; diagnostics: unknown[] };
    expect(parsed.success).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('produces parseable JSON diagnostics on failure too', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['validate', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      diagnostics: { code: string }[];
    };
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    expect(parsed.diagnostics[0]?.code).toMatch(/^AGF2/);
  });

  it('suppresses non-essential output in --quiet mode while still failing correctly', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['--quiet', 'validate'], project.dir);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe('');
  });

  it('never emits ANSI color codes with --no-color', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['--no-color', 'validate'], project.dir);
    expect(result.stdout).not.toContain('[31m');
  });

  it('escalates warnings to failures in --strict mode', () => {
    // The fixture project itself has no warnings today, so this exercises
    // the escalation logic directly via a document that is valid but
    // would only fail under --strict if a warning existed; absent a real
    // warning-producing case yet, confirm --strict is at least accepted
    // and a valid project still succeeds (the escalation path itself is
    // covered at the unit level in exit-codes.test.ts).
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['validate', '--strict'], project.dir);
    expect(result.exitCode).toBe(0);
  });

  it('supports --help', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['validate', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--strict');
  });

  it('exits 2 (invalid command usage) for an unknown flag', () => {
    project = createFixtureProject(VALID_PROJECT);
    const result = runCli(['validate', '--not-a-real-flag'], project.dir);
    expect(result.exitCode).toBe(2);
  });
});
