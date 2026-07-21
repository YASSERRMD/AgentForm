import { existsSync } from 'node:fs';
import path from 'node:path';
import { SqliteStateBackend } from '@agentform/state-local';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function project(): Record<string, string> {
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
      '        text: v1',
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

async function readHistory(rootDir: string) {
  const backend = new SqliteStateBackend({ stateDir: path.join(rootDir, '.agentform') });
  await backend.open();
  try {
    return await backend.listApplyHistory();
  } finally {
    await backend.close();
  }
}

let fixture: FixtureProject | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('agentform destroy --plan', () => {
  it('reports nothing to destroy when no resources are tracked', () => {
    fixture = createFixtureProject(project());
    const result = runCli(['destroy', '--plan'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to destroy');
  });

  it('shows every tracked resource as a DELETE without changing anything', () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['destroy', '--plan'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('workflow.main will be destroyed');
    expect(result.stdout).toContain('agent.assistant will be destroyed');
    expect(result.stdout).toContain('model.primary will be destroyed');

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     3 tracked');
  });

  it('produces parseable JSON output', () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['destroy', '--plan', '--json'], fixture.dir);
    const parsed = JSON.parse(result.stdout) as { success: boolean; items: unknown[] };
    expect(parsed.success).toBe(true);
    expect(parsed.items).toHaveLength(3);
  });
});

describe('agentform destroy', () => {
  it('reports nothing to destroy and exits 0 when no resources are tracked', () => {
    fixture = createFixtureProject(project());
    const result = runCli(['destroy', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to destroy');
  });

  it('destroys every tracked resource with --auto-approve, removing generated artifacts', async () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    expect(existsSync(path.join(fixture.dir, 'generated', 'openai'))).toBe(true);

    const result = runCli(['destroy', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Destroyed 3 resource(s)');
    expect(result.stdout).toContain('removed generated/openai');
    expect(existsSync(path.join(fixture.dir, 'generated', 'openai'))).toBe(false);

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     0 tracked');

    const history = await readHistory(fixture.dir);
    expect(history[0]).toMatchObject({ status: 'succeeded' });
  });

  it('never erases audit history — destroy adds a record on top of apply history', async () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    expect(runCli(['destroy', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const history = await readHistory(fixture.dir);
    expect(history).toHaveLength(2);
    expect(history.every((h) => h.status === 'succeeded')).toBe(true);
  });

  it('exits with a failure code for a non-interactive destroy without --auto-approve, destroying nothing', () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['destroy'], fixture.dir);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toContain('Re-run with --auto-approve');

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     3 tracked');
    expect(existsSync(path.join(fixture.dir, 'generated', 'openai'))).toBe(true);
  });

  it('releases the lock after a declined destroy so the next command can proceed', () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    expect(runCli(['destroy'], fixture.dir).exitCode).toBe(10);

    const result = runCli(['destroy', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
  });

  it('warns about generated artifacts that cannot be recovered before destroying', () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['destroy'], fixture.dir);
    expect(result.stderr).toContain('cannot be recovered');
    expect(result.stderr).toContain(path.join('generated', 'openai'));
  });

  it('produces parseable JSON output', async () => {
    fixture = createFixtureProject(project());
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['destroy', '--auto-approve', '--json'], fixture.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      destroyed: boolean;
      items: unknown[];
      removedArtifacts: string[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.destroyed).toBe(true);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.removedArtifacts).toHaveLength(1);
  });

  it('supports --help', () => {
    fixture = createFixtureProject(project());
    const result = runCli(['destroy', '--help'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--auto-approve');
    expect(result.stdout).toContain('--plan');
  });
});
