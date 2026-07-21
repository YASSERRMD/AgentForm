import { randomUUID } from 'node:crypto';
import type { ApplicationState, ResourceState } from '@agentform/state';
import { StateLockError } from '@agentform/state';
import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PostgresStateBackend } from './postgres-state-backend.js';

const CONNECTION_STRING =
  process.env.AGENTFORM_TEST_POSTGRES_URL ??
  'postgresql://postgres:postgres@localhost:5432/agentform_test';

async function dropSchema(name: string): Promise<void> {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
  } finally {
    await client.end();
  }
}

function applicationState(overrides: Partial<ApplicationState> = {}): ApplicationState {
  return {
    applicationName: 'fixture-app',
    environment: 'development',
    specificationHash: 'sha256:spec',
    irHash: 'sha256:ir',
    schemaVersion: 'v1alpha1',
    adapterVersions: { openai: '0.1.0' },
    deploymentIdentifiers: {},
    driftStatus: 'unknown',
    ...overrides,
  };
}

function resourceState(
  overrides: Partial<ResourceState> & Pick<ResourceState, 'address' | 'kind'>,
): ResourceState {
  return {
    contentHash: 'sha256:content',
    identityHash: 'sha256:identity',
    dependsOn: [],
    lastAppliedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let schema: string;
let backend: PostgresStateBackend;

beforeEach(async () => {
  schema = `test_${randomUUID().replace(/-/g, '_')}`;
  backend = new PostgresStateBackend({ connectionString: CONNECTION_STRING, schema });
  await backend.open();
});

afterEach(async () => {
  await backend.close();
  await dropSchema(schema);
});

describe('PostgresStateBackend', () => {
  it('reports its kind', () => {
    expect(backend.kind).toBe('postgres');
  });

  it('starts at schema version 1 after open()', async () => {
    expect(await backend.getSchemaVersion()).toBe(1);
  });

  it('isolates two backends pointed at different schemas in the same database', async () => {
    const otherSchema = `test_${randomUUID().replace(/-/g, '_')}`;
    const other = new PostgresStateBackend({
      connectionString: CONNECTION_STRING,
      schema: otherSchema,
    });
    await other.open();
    try {
      await backend.putApplicationState(applicationState({ applicationName: 'in-first-schema' }));
      expect(await other.getApplicationState()).toBeUndefined();
    } finally {
      await other.close();
      await dropSchema(otherSchema);
    }
  });

  describe('application state', () => {
    it('returns undefined before anything has been applied', async () => {
      expect(await backend.getApplicationState()).toBeUndefined();
    });

    it('round-trips a put application state, including JSONB fields', async () => {
      const state = applicationState({
        adapterVersions: { openai: '0.1.0', langgraph: '0.2.0' },
        deploymentIdentifiers: { openai: 'deployment-1' },
      });
      await backend.putApplicationState(state);
      expect(await backend.getApplicationState()).toEqual(state);
    });

    it('upserts on a second put rather than erroring', async () => {
      await backend.putApplicationState(applicationState({ environment: 'development' }));
      await backend.putApplicationState(applicationState({ environment: 'production' }));
      expect((await backend.getApplicationState())?.environment).toBe('production');
    });

    it('recordDriftStatus updates only the two drift fields', async () => {
      await backend.putApplicationState(applicationState({ environment: 'production' }));
      await backend.recordDriftStatus('drifted', '2026-02-01T00:00:00.000Z');
      const state = await backend.getApplicationState();
      expect(state?.driftStatus).toBe('drifted');
      expect(state?.driftCheckedAt).toBe('2026-02-01T00:00:00.000Z');
      expect(state?.environment).toBe('production');
    });

    it('recordDriftStatus throws when no application state exists yet', async () => {
      await expect(
        backend.recordDriftStatus('in_sync', '2026-02-01T00:00:00.000Z'),
      ).rejects.toThrow(/no application state exists/);
    });

    it('putApplicationState resets drift status on every call', async () => {
      await backend.putApplicationState(applicationState());
      await backend.recordDriftStatus('in_sync', '2026-02-01T00:00:00.000Z');
      await backend.putApplicationState(applicationState());
      expect((await backend.getApplicationState())?.driftStatus).toBe('unknown');
    });
  });

  describe('resource states', () => {
    it('lists nothing before anything is tracked', async () => {
      expect(await backend.listResourceStates()).toEqual([]);
    });

    it('round-trips a resource state, including a dependsOn array', async () => {
      const resource = resourceState({
        address: 'agent.assistant',
        kind: 'agent',
        dependsOn: ['model.primary', 'tool.search'],
      });
      await backend.putResourceState(resource);
      expect(await backend.getResourceState('agent.assistant')).toEqual(resource);
    });

    it('lists resources ordered by address', async () => {
      await backend.putResourceState(resourceState({ address: 'workflow.main', kind: 'workflow' }));
      await backend.putResourceState(resourceState({ address: 'agent.assistant', kind: 'agent' }));
      await backend.putResourceState(resourceState({ address: 'model.primary', kind: 'model' }));
      const addresses = (await backend.listResourceStates()).map((r) => r.address);
      expect(addresses).toEqual(['agent.assistant', 'model.primary', 'workflow.main']);
    });

    it('deleteResourceState removes exactly one resource', async () => {
      await backend.putResourceState(resourceState({ address: 'agent.a', kind: 'agent' }));
      await backend.putResourceState(resourceState({ address: 'agent.b', kind: 'agent' }));
      await backend.deleteResourceState('agent.a');
      expect((await backend.listResourceStates()).map((r) => r.address)).toEqual(['agent.b']);
    });
  });

  describe('apply history', () => {
    it('records a start then a finish', async () => {
      await backend.recordApplyStart({ id: 'apply-1', startedAt: '2026-01-01T00:00:00.000Z' });
      await backend.recordApplyFinish('apply-1', 'succeeded', 'created 3 resources');
      const [entry] = await backend.listApplyHistory();
      expect(entry).toMatchObject({
        id: 'apply-1',
        status: 'succeeded',
        summary: 'created 3 resources',
      });
    });

    it('lists history newest first', async () => {
      await backend.recordApplyStart({ id: 'apply-1', startedAt: '2026-01-01T00:00:00.000Z' });
      await backend.recordApplyFinish('apply-1', 'succeeded');
      await backend.recordApplyStart({ id: 'apply-2', startedAt: '2026-01-02T00:00:00.000Z' });
      await backend.recordApplyFinish('apply-2', 'succeeded');
      const history = await backend.listApplyHistory();
      expect(history.map((h) => h.id)).toEqual(['apply-2', 'apply-1']);
    });

    it('crash recovery marks an in-progress entry as interrupted on the next open()', async () => {
      await backend.recordApplyStart({
        id: 'apply-crashed',
        startedAt: '2026-01-01T00:00:00.000Z',
      });
      await backend.close();

      const reopened = new PostgresStateBackend({ connectionString: CONNECTION_STRING, schema });
      await reopened.open();
      try {
        const [entry] = await reopened.listApplyHistory();
        expect(entry?.status).toBe('interrupted');
      } finally {
        await reopened.close();
      }
      // backend itself stays closed here — afterEach's own backend.close() is a harmless no-op on an already-closed instance
    });
  });

  describe('withTransaction', () => {
    it('commits every write when fn succeeds', async () => {
      await backend.withTransaction(async () => {
        await backend.putResourceState(resourceState({ address: 'agent.a', kind: 'agent' }));
        await backend.putApplicationState(applicationState());
      });
      expect(await backend.listResourceStates()).toHaveLength(1);
      expect(await backend.getApplicationState()).not.toBeUndefined();
    });

    it('rolls back every write when fn throws', async () => {
      await expect(
        backend.withTransaction(async () => {
          await backend.putResourceState(resourceState({ address: 'agent.a', kind: 'agent' }));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await backend.listResourceStates()).toEqual([]);
    });
  });

  describe('locking', () => {
    it('acquires and releases without contention', async () => {
      await backend.acquireLock({ reason: 'test' });
      await backend.releaseLock();
      await backend.acquireLock({ reason: 'test again' });
      await backend.releaseLock();
    });

    it('rejects a second acquire while the lock is live', async () => {
      await backend.acquireLock({ reason: 'first' });
      await expect(backend.acquireLock({ reason: 'second' })).rejects.toThrow(StateLockError);
    });

    it('takes over a stale lock', async () => {
      await backend.acquireLock({ reason: 'stale one', staleTimeoutMs: 0 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await backend.acquireLock({ reason: 'takeover', staleTimeoutMs: 0 });
    });

    it('withLock releases even when fn throws', async () => {
      await expect(
        backend.withLock(() => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await backend.acquireLock();
      await backend.releaseLock();
    });
  });

  describe('backups', () => {
    it('lists no backups before any are created', async () => {
      expect(await backend.listBackups()).toEqual([]);
    });

    it('createBackup snapshots current state, readable in isolation via readBackupSnapshot', async () => {
      await backend.putApplicationState(applicationState());
      await backend.putResourceState(resourceState({ address: 'agent.a', kind: 'agent' }));
      const backupId = await backend.createBackup();

      await backend.putResourceState(resourceState({ address: 'agent.b', kind: 'agent' }));

      const snapshot = await backend.readBackupSnapshot(backupId);
      expect(snapshot.resourceStates.map((r) => r.address)).toEqual(['agent.a']);
      expect(snapshot.applicationState?.applicationName).toBe('fixture-app');
      // the live database is untouched by the read
      expect((await backend.listResourceStates()).map((r) => r.address).sort()).toEqual([
        'agent.a',
        'agent.b',
      ]);
    });

    it('readBackupSnapshot throws for an unknown backup id', async () => {
      await expect(backend.readBackupSnapshot('does-not-exist')).rejects.toThrow();
    });

    it('restoreBackup replaces live state and clears apply history', async () => {
      await backend.putApplicationState(applicationState());
      await backend.putResourceState(resourceState({ address: 'agent.a', kind: 'agent' }));
      const backupId = await backend.createBackup();

      await backend.recordApplyStart({ id: 'apply-1', startedAt: '2026-01-01T00:00:00.000Z' });
      await backend.recordApplyFinish('apply-1', 'succeeded');
      await backend.putResourceState(resourceState({ address: 'agent.b', kind: 'agent' }));

      await backend.restoreBackup(backupId);

      expect((await backend.listResourceStates()).map((r) => r.address)).toEqual(['agent.a']);
      expect(await backend.listApplyHistory()).toEqual([]);
    });
  });
});
