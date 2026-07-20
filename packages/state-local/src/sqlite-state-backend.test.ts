import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateLockError } from '@agentform/state';
import { SqliteStateBackend } from './sqlite-state-backend.js';

let dir: string;
let stateDir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentform-state-local-backend-'));
  stateDir = path.join(dir, '.agentform');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteStateBackend', () => {
  it('reports its kind', () => {
    const backend = new SqliteStateBackend({ stateDir });
    expect(backend.kind).toBe('sqlite');
  });

  it('open() creates the database file and applies migrations', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    expect(existsSync(path.join(stateDir, 'state.db'))).toBe(true);
    expect(await backend.getSchemaVersion()).toBeGreaterThan(0);
    await backend.close();
  });

  it('round-trips application state', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    const state = {
      applicationName: 'municipal-complaint-assistant',
      environment: 'production',
      specificationHash: 'spec-hash',
      irHash: 'ir-hash',
      schemaVersion: '1',
      adapterVersions: { openai: '1.0.0' },
      deploymentIdentifiers: { region: 'us-east-1' },
      lastAppliedAt: '2026-01-01T00:00:00.000Z',
    };
    await backend.putApplicationState(state);
    expect(await backend.getApplicationState()).toEqual(state);
    await backend.close();
  });

  it('putApplicationState overwrites the single row rather than accumulating', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    const base = {
      applicationName: 'a',
      environment: 'dev',
      specificationHash: 'h1',
      irHash: 'h1',
      schemaVersion: '1',
      adapterVersions: {},
      deploymentIdentifiers: {},
    };
    await backend.putApplicationState(base);
    await backend.putApplicationState({ ...base, specificationHash: 'h2' });
    expect((await backend.getApplicationState())?.specificationHash).toBe('h2');
    await backend.close();
  });

  it('returns undefined application state before anything is written', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    expect(await backend.getApplicationState()).toBeUndefined();
    await backend.close();
  });

  it('round-trips resource state, including dependsOn', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    const resource = {
      address: 'agent.intake',
      kind: 'agent' as const,
      contentHash: 'hash-1',
      dependsOn: ['model.primary', 'tool.registry'],
      lastAppliedAt: '2026-01-01T00:00:00.000Z',
    };
    await backend.putResourceState(resource);
    expect(await backend.getResourceState('agent.intake')).toEqual(resource);
    await backend.close();
  });

  it('lists resource states sorted by address', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    await backend.putResourceState({
      address: 'workflow.main',
      kind: 'workflow',
      contentHash: 'h',
      dependsOn: [],
      lastAppliedAt: '2026-01-01T00:00:00.000Z',
    });
    await backend.putResourceState({
      address: 'agent.intake',
      kind: 'agent',
      contentHash: 'h',
      dependsOn: [],
      lastAppliedAt: '2026-01-01T00:00:00.000Z',
    });
    const listed = await backend.listResourceStates();
    expect(listed.map((r) => r.address)).toEqual(['agent.intake', 'workflow.main']);
    await backend.close();
  });

  it('deletes a resource state', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    await backend.putResourceState({
      address: 'agent.intake',
      kind: 'agent',
      contentHash: 'h',
      dependsOn: [],
      lastAppliedAt: '2026-01-01T00:00:00.000Z',
    });
    await backend.deleteResourceState('agent.intake');
    expect(await backend.getResourceState('agent.intake')).toBeUndefined();
    await backend.close();
  });

  it('records apply history from start to finish', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    await backend.recordApplyStart({ id: 'apply-1', startedAt: '2026-01-01T00:00:00.000Z' });
    let history = await backend.listApplyHistory();
    expect(history[0]).toMatchObject({ id: 'apply-1', status: 'in_progress' });

    await backend.recordApplyFinish('apply-1', 'succeeded', 'applied 3 resources');
    history = await backend.listApplyHistory();
    expect(history[0]).toMatchObject({
      id: 'apply-1',
      status: 'succeeded',
      summary: 'applied 3 resources',
    });
    expect(history[0]?.finishedAt).toBeDefined();
    await backend.close();
  });

  it('recovers an interrupted apply on reopen after a simulated crash', async () => {
    const first = new SqliteStateBackend({ stateDir });
    await first.open();
    await first.recordApplyStart({ id: 'apply-crash', startedAt: '2026-01-01T00:00:00.000Z' });
    await first.close(); // simulates the process dying mid-apply: never recordApplyFinish

    const second = new SqliteStateBackend({ stateDir });
    await second.open(); // recovery runs here
    const history = await second.listApplyHistory();
    expect(history[0]).toMatchObject({ id: 'apply-crash', status: 'interrupted' });
    await second.close();
  });

  it('creates a backup', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    const id = await backend.createBackup();
    expect(existsSync(path.join(stateDir, 'backups', id))).toBe(true);
    await backend.close();
  });

  it('acquireLock/releaseLock/withLock work through the backend', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    await backend.acquireLock({ reason: 'test' });
    expect(existsSync(path.join(stateDir, 'lock'))).toBe(true);
    await backend.releaseLock();
    expect(existsSync(path.join(stateDir, 'lock'))).toBe(false);

    const result = await backend.withLock(() => 42);
    expect(result).toBe(42);
    expect(existsSync(path.join(stateDir, 'lock'))).toBe(false);
    await backend.close();
  });

  it('withLock releases the lock even when the callback throws', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await backend.open();
    await expect(
      backend.withLock(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(path.join(stateDir, 'lock'))).toBe(false);
    await backend.close();
  });

  it('a second backend cannot acquire the lock while the first holds it', async () => {
    const first = new SqliteStateBackend({ stateDir });
    await first.open();
    await first.acquireLock({ reason: 'first' });

    const second = new SqliteStateBackend({ stateDir });
    await second.open();
    await expect(second.acquireLock()).rejects.toThrow(StateLockError);

    await first.releaseLock();
    await first.close();
    await second.close();
  });

  it('using the backend before open() throws rather than segfaulting on a null db', async () => {
    const backend = new SqliteStateBackend({ stateDir });
    await expect(backend.getApplicationState()).rejects.toThrow(/before open/);
  });
});
