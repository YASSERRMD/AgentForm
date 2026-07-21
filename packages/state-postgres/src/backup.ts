import type { ApplicationState, BackupInfo, ResourceState, StateSnapshot } from '@agentform/state';
import type { PoolClient } from 'pg';
import { queryApplicationState, queryResourceStates } from './rows.js';

/**
 * Snapshots the database to a new `state_backups` row (§10 "State backup
 * before mutations") — the table-based analog to the local backend's
 * `backupsDir/state-<timestamp>.db` file copy, since there is no single
 * file here to copy. `application_state`/`resource_states` are stored as
 * `JSONB`, letting `readBackupSnapshot` read them straight back without
 * re-deriving anything.
 */
export async function createBackup(client: PoolClient): Promise<string> {
  const [applicationState, resourceStates] = await Promise.all([
    queryApplicationState(client),
    queryResourceStates(client),
  ]);
  const id = `state-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await client.query(
    'INSERT INTO state_backups (id, created_at, application_state, resource_states) VALUES ($1, $2, $3, $4)',
    [id, new Date().toISOString(), applicationState ?? null, JSON.stringify(resourceStates)],
  );
  return id;
}

interface BackupInfoRow {
  id: string;
  created_at: string;
  size_bytes: string;
}

/** Every backup, newest first. `size_bytes` uses Postgres's own `pg_column_size` — a real on-disk byte count, not an approximation. */
export async function listBackups(client: PoolClient): Promise<readonly BackupInfo[]> {
  const result = await client.query<BackupInfoRow>(
    `SELECT id, created_at,
            (pg_column_size(application_state) + pg_column_size(resource_states)) AS size_bytes
     FROM state_backups
     ORDER BY created_at DESC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sizeBytes: Number(row.size_bytes),
  }));
}

interface SnapshotRow {
  application_state: ApplicationState | null;
  resource_states: readonly ResourceState[];
}

async function readBackupRow(client: PoolClient, backupId: string): Promise<SnapshotRow> {
  const result = await client.query<SnapshotRow>(
    'SELECT application_state, resource_states FROM state_backups WHERE id = $1',
    [backupId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Backup "${backupId}" does not exist`);
  }
  return row;
}

/** Reads a backup's content without mutating anything — the read side `agentform rollback` uses (never `restoreBackup`, see its own doc comment). */
export async function readBackupSnapshot(
  client: PoolClient,
  backupId: string,
): Promise<StateSnapshot> {
  const row = await readBackupRow(client, backupId);
  return {
    applicationState: row.application_state ?? undefined,
    resourceStates: row.resource_states,
  };
}

/**
 * Disaster recovery only, exactly like the local backend's own
 * `restoreBackup` — replaces `application_state`/`resource_states`
 * wholesale from the named backup and clears `apply_history` entirely,
 * discarding every operation recorded since. The caller (the backend's
 * own `restoreBackup` method) is responsible for running this inside a
 * transaction; `agentform rollback` must never call this — see
 * `readBackupSnapshot` above for the isolated read it actually uses.
 */
export async function restoreBackup(client: PoolClient, backupId: string): Promise<void> {
  const row = await readBackupRow(client, backupId);
  await client.query('DELETE FROM apply_history');
  await client.query('DELETE FROM resource_states');
  await client.query('DELETE FROM application_state');

  if (row.application_state) {
    const state = row.application_state;
    await client.query(
      `INSERT INTO application_state
         (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers, last_applied_at, drift_status, drift_checked_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        state.applicationName,
        state.environment,
        state.specificationHash,
        state.irHash,
        state.schemaVersion,
        JSON.stringify(state.adapterVersions),
        JSON.stringify(state.deploymentIdentifiers),
        state.lastAppliedAt ?? null,
        state.driftStatus,
        state.driftCheckedAt ?? null,
      ],
    );
  }

  for (const resource of row.resource_states) {
    await client.query(
      `INSERT INTO resource_states (address, kind, content_hash, identity_hash, depends_on, last_applied_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        resource.address,
        resource.kind,
        resource.contentHash,
        resource.identityHash,
        JSON.stringify(resource.dependsOn),
        resource.lastAppliedAt,
      ],
    );
  }
}
