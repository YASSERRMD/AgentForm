import { readFileSync } from 'node:fs';
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
