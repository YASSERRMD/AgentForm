import path from 'node:path';
import { writeFileSync } from 'node:fs';
import type { ApplyHistoryEntry } from '@agentform/state';
import { SqliteStateBackend } from '@agentform/state-local';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';
import { resolveRollbackTarget } from './rollback.js';

function project(instructionsText: string): Record<string, string> {
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

async function readHistory(rootDir: string) {
  const backend = new SqliteStateBackend({ stateDir: path.join(rootDir, '.agentform') });
  await backend.open();
  try {
    return await backend.listApplyHistory();
  } finally {
    await backend.close();
  }
}

async function createManualBackup(rootDir: string): Promise<string> {
  const backend = new SqliteStateBackend({ stateDir: path.join(rootDir, '.agentform') });
  await backend.open();
  try {
    return await backend.createBackup();
  } finally {
    await backend.close();
  }
}

function historyEntry(overrides: Partial<ApplyHistoryEntry> = {}): ApplyHistoryEntry {
  return {
    id: 'apply-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'succeeded',
    backupId: 'state-backup-1.db',
    ...overrides,
  };
}

describe('resolveRollbackTarget', () => {
  it('defaults to the most recent history entry’s backup', () => {
    const history = [
      historyEntry({ id: 'apply-2', backupId: 'backup-2.db' }),
      historyEntry({ id: 'apply-1', backupId: 'backup-1.db' }),
    ];
    const { target } = resolveRollbackTarget({}, history);
    expect(target?.backupId).toBe('backup-2.db');
  });

  it('errors when there is no history at all', () => {
    const { target, error } = resolveRollbackTarget({}, []);
    expect(target).toBeUndefined();
    expect(error).toContain('nothing to roll back');
  });

  it('errors when the most recent entry has no backup', () => {
    const { target, error } = resolveRollbackTarget({}, [historyEntry({ backupId: undefined })]);
    expect(target).toBeUndefined();
    expect(error).toContain('nothing to roll back');
  });

  it('--to resolves to the named entry’s backup', () => {
    const history = [
      historyEntry({ id: 'apply-2', backupId: 'backup-2.db' }),
      historyEntry({ id: 'apply-1', backupId: 'backup-1.db' }),
    ];
    const { target } = resolveRollbackTarget({ to: 'apply-1' }, history);
    expect(target?.backupId).toBe('backup-1.db');
  });

  it('--to errors when no entry has that id', () => {
    const { target, error } = resolveRollbackTarget({ to: 'does-not-exist' }, [historyEntry()]);
    expect(target).toBeUndefined();
    expect(error).toContain('does-not-exist');
  });

  it('--to errors when the matching entry has no backup', () => {
    const { target, error } = resolveRollbackTarget({ to: 'apply-1' }, [
      historyEntry({ id: 'apply-1', backupId: undefined }),
    ]);
    expect(target).toBeUndefined();
    expect(error).toContain('no associated backup');
  });

  it('--snapshot resolves directly, bypassing history entirely', () => {
    const { target } = resolveRollbackTarget({ snapshot: 'state-custom.db' }, []);
    expect(target?.backupId).toBe('state-custom.db');
  });
});

let fixture: FixtureProject | undefined;

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

describe('agentform rollback', () => {
  it('exits 15 (ROLLBACK_FAILURE) when there is no apply history yet', () => {
    fixture = createFixtureProject(project('v1'));
    const result = runCli(['rollback', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(15);
    expect(result.stderr).toContain('nothing to roll back');
  });

  it('rolls back to the state before the most recent apply by default, regenerating artifacts', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['rollback', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Rolled back');
    expect(result.stdout).toMatch(/Regenerated \d+ files/);

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     0 tracked');

    const history = await readHistory(fixture.dir);
    expect(history[0]).toMatchObject({ status: 'succeeded' });
  });

  it('never erases audit history — a rollback adds a new record on top of every prior one', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('v2')['agentform.yaml']!,
      'utf-8',
    );
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    expect(runCli(['rollback', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const history = await readHistory(fixture.dir);
    expect(history).toHaveLength(3);
    expect(history.every((h) => h.status === 'succeeded')).toBe(true);
  });

  it('reports nothing to roll back when the target snapshot matches current state exactly', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    const backupId = await createManualBackup(fixture.dir);

    const result = runCli(['rollback', '--snapshot', backupId, '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('nothing to roll back');

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     3 tracked');
  });

  it('exits 15 for a non-interactive rollback without --auto-approve, changing nothing', () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['rollback'], fixture.dir);
    expect(result.exitCode).toBe(15);

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     3 tracked');
  });

  it('rolls back to a specific apply identifier with --to', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    const [firstApply] = await readHistory(fixture.dir);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('v2')['agentform.yaml']!,
      'utf-8',
    );
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['rollback', '--to', firstApply!.id, '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    // rolling back to "right before the first apply" means empty state
    expect(runCli(['status'], fixture.dir).stdout).toContain('Resources:     0 tracked');
  });

  it('exits 15 for an unknown --to apply identifier', () => {
    fixture = createFixtureProject(project('v1'));
    const result = runCli(['rollback', '--to', 'does-not-exist', '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(15);
    expect(result.stderr).toContain('does-not-exist');
  });

  it('recovers cleanly from a real execution failure (an unreadable snapshot): no history entry is added, resources are untouched, and the lock is released', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    const historyBefore = await readHistory(fixture.dir);

    const result = runCli(
      ['rollback', '--snapshot', 'state-backup-does-not-exist.db', '--auto-approve'],
      fixture.dir,
    );
    expect(result.exitCode).toBe(15);
    expect(result.stderr).toContain('Cannot read backup');

    const status = runCli(['status'], fixture.dir);
    expect(status.stdout).toContain('Resources:     3 tracked');
    const historyAfter = await readHistory(fixture.dir);
    expect(historyAfter).toEqual(historyBefore);

    // the lock was released despite the failure — the next command isn't blocked
    const nextRollback = runCli(['rollback', '--auto-approve'], fixture.dir);
    expect(nextRollback.exitCode).toBe(0);
  });

  it('rolls back to a specific snapshot with --snapshot', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);
    const backupId = await createManualBackup(fixture.dir);

    writeFileSync(
      path.join(fixture.dir, 'agentform.yaml'),
      project('v2')['agentform.yaml']!,
      'utf-8',
    );
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['rollback', '--snapshot', backupId, '--auto-approve'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(runCli(['status'], fixture.dir).stdout).toContain('Resources:     3 tracked');
  });

  it('rejects --to and --snapshot together with INVALID_USAGE (2)', () => {
    fixture = createFixtureProject(project('v1'));
    const result = runCli(
      ['rollback', '--to', 'x', '--snapshot', 'y', '--auto-approve'],
      fixture.dir,
    );
    expect(result.exitCode).toBe(2);
  });

  it('produces parseable JSON output', async () => {
    fixture = createFixtureProject(project('v1'));
    expect(runCli(['apply', '--auto-approve'], fixture.dir).exitCode).toBe(0);

    const result = runCli(['rollback', '--auto-approve', '--json'], fixture.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      rolledBack: boolean;
      removed: string[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.rolledBack).toBe(true);
    expect(parsed.removed.length).toBeGreaterThan(0);
  });

  it('supports --help', () => {
    fixture = createFixtureProject(project('v1'));
    const result = runCli(['rollback', '--help'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--snapshot');
  });
});
