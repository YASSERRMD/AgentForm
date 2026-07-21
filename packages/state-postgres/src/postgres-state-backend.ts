import type {
  ApplicationState,
  ApplyHistoryEntry,
  ApplyOperationStatus,
  BackupInfo,
  DriftStatus,
  LockOptions,
  MigrationResult,
  ResourceState,
  StateBackend,
  StateSnapshot,
} from '@agentform/state';
import { Pool, type PoolClient } from 'pg';
import { acquireLock, releaseLock } from './lock.js';
import { createBackup, listBackups, readBackupSnapshot, restoreBackup } from './backup.js';
import { currentSchemaVersion, runMigrations } from './migrations.js';
import { queryApplicationState, queryResourceStates, rowToApplyHistoryEntry } from './rows.js';
import { recoverInterruptedOperations } from './recovery.js';

export interface PostgresStateBackendOptions {
  readonly connectionString: string;
  /** All Agentform tables live under this Postgres schema, so multiple projects can safely share one database. Defaults to `"agentform"`. */
  readonly schema?: string;
}

const DEFAULT_SCHEMA = 'agentform';
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** `schema` is interpolated directly into DDL (Postgres has no parameterized-identifier syntax) — validated against a strict identifier pattern first, since it could originate from project configuration rather than a hardcoded literal. */
function assertValidSchemaName(schema: string): void {
  if (!IDENTIFIER_PATTERN.test(schema)) {
    throw new Error(
      `Invalid Postgres schema name "${schema}" — must match ${IDENTIFIER_PATTERN.source}`,
    );
  }
}

interface ApplyHistoryRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  plan_hash: string | null;
  backup_id: string | null;
  summary: string | null;
}

/**
 * PostgreSQL-backed `StateBackend` (`@agentform/state`) — the remote
 * counterpart to `@agentform/state-local`'s SQLite implementation,
 * implementing the exact same interface so `apps/cli` can select either
 * at runtime without any command needing to know which one it's talking
 * to. Every method mirrors `SqliteStateBackend`'s own, translated from
 * `node:sqlite`'s synchronous API to `pg`'s async one; see `lock.ts`/
 * `backup.ts`/`migrations.ts` for where the two implementations
 * genuinely differ (table-based locking and backups, since there is no
 * filesystem to use as SQLite does).
 */
export class PostgresStateBackend implements StateBackend {
  readonly kind = 'postgres';

  private readonly connectionString: string;
  private readonly schema: string;
  private pool: Pool | undefined;
  private client: PoolClient | undefined;

  constructor(options: PostgresStateBackendOptions) {
    this.connectionString = options.connectionString;
    this.schema = options.schema ?? DEFAULT_SCHEMA;
    assertValidSchemaName(this.schema);
  }

  private get connection(): PoolClient {
    if (!this.client) {
      throw new Error('PostgresStateBackend used before open() (or after close())');
    }
    return this.client;
  }

  async open(): Promise<void> {
    this.pool = new Pool({ connectionString: this.connectionString });
    this.client = await this.pool.connect();
    await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await this.client.query(`SET search_path TO "${this.schema}"`);
    await runMigrations(this.client);
    await recoverInterruptedOperations(this.client);
  }

  async close(): Promise<void> {
    this.client?.release();
    this.client = undefined;
    await this.pool?.end();
    this.pool = undefined;
  }

  async migrate(): Promise<MigrationResult> {
    return runMigrations(this.connection);
  }

  async getSchemaVersion(): Promise<number> {
    return currentSchemaVersion(this.connection);
  }

  async acquireLock(options?: LockOptions): Promise<void> {
    await acquireLock(this.connection, {
      reason: options?.reason,
      staleTimeoutMs: options?.staleTimeoutMs,
    });
  }

  async releaseLock(): Promise<void> {
    await releaseLock(this.connection);
  }

  async withLock<T>(fn: () => Promise<T> | T, options?: LockOptions): Promise<T> {
    await this.acquireLock(options);
    try {
      return await fn();
    } finally {
      await this.releaseLock();
    }
  }

  async withTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.connection.query('BEGIN');
    try {
      const result = await fn();
      await this.connection.query('COMMIT');
      return result;
    } catch (error) {
      await this.connection.query('ROLLBACK');
      throw error;
    }
  }

  async getApplicationState(): Promise<ApplicationState | undefined> {
    return queryApplicationState(this.connection);
  }

  async putApplicationState(state: ApplicationState): Promise<void> {
    await this.connection.query(
      `INSERT INTO application_state
         (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers, last_applied_at, drift_status, drift_checked_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         application_name = excluded.application_name,
         environment = excluded.environment,
         specification_hash = excluded.specification_hash,
         ir_hash = excluded.ir_hash,
         schema_version = excluded.schema_version,
         adapter_versions = excluded.adapter_versions,
         deployment_identifiers = excluded.deployment_identifiers,
         last_applied_at = excluded.last_applied_at,
         drift_status = excluded.drift_status,
         drift_checked_at = excluded.drift_checked_at`,
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

  async recordDriftStatus(status: DriftStatus, checkedAt: string): Promise<void> {
    const result = await this.connection.query(
      'UPDATE application_state SET drift_status = $1, drift_checked_at = $2 WHERE id = 1',
      [status, checkedAt],
    );
    if (result.rowCount === 0) {
      throw new Error(
        'Cannot record drift status: no application state exists yet (nothing has been applied)',
      );
    }
  }

  async listResourceStates(): Promise<readonly ResourceState[]> {
    return queryResourceStates(this.connection);
  }

  async getResourceState(address: string): Promise<ResourceState | undefined> {
    const result = await this.connection.query('SELECT * FROM resource_states WHERE address = $1', [
      address,
    ]);
    const row = result.rows[0] as
      | {
          address: string;
          kind: ResourceState['kind'];
          content_hash: string;
          identity_hash: string;
          depends_on: readonly string[];
          last_applied_at: string;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      address: row.address,
      kind: row.kind,
      contentHash: row.content_hash,
      identityHash: row.identity_hash,
      dependsOn: row.depends_on,
      lastAppliedAt: row.last_applied_at,
    };
  }

  async putResourceState(state: ResourceState): Promise<void> {
    await this.connection.query(
      `INSERT INTO resource_states (address, kind, content_hash, identity_hash, depends_on, last_applied_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (address) DO UPDATE SET
         kind = excluded.kind,
         content_hash = excluded.content_hash,
         identity_hash = excluded.identity_hash,
         depends_on = excluded.depends_on,
         last_applied_at = excluded.last_applied_at`,
      [
        state.address,
        state.kind,
        state.contentHash,
        state.identityHash,
        JSON.stringify(state.dependsOn),
        state.lastAppliedAt,
      ],
    );
  }

  async deleteResourceState(address: string): Promise<void> {
    await this.connection.query('DELETE FROM resource_states WHERE address = $1', [address]);
  }

  async recordApplyStart(entry: Omit<ApplyHistoryEntry, 'status'>): Promise<void> {
    await this.connection.query(
      `INSERT INTO apply_history (id, started_at, finished_at, status, plan_hash, backup_id, summary)
       VALUES ($1, $2, NULL, 'in_progress', $3, $4, $5)`,
      [
        entry.id,
        entry.startedAt,
        entry.planHash ?? null,
        entry.backupId ?? null,
        entry.summary ?? null,
      ],
    );
  }

  async recordApplyFinish(
    id: string,
    status: ApplyOperationStatus,
    summary?: string,
  ): Promise<void> {
    await this.connection.query(
      'UPDATE apply_history SET status = $1, finished_at = $2, summary = $3 WHERE id = $4',
      [status, new Date().toISOString(), summary ?? null, id],
    );
  }

  async listApplyHistory(limit = 50): Promise<readonly ApplyHistoryEntry[]> {
    const result = await this.connection.query<ApplyHistoryRow>(
      'SELECT * FROM apply_history ORDER BY started_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(rowToApplyHistoryEntry);
  }

  async createBackup(): Promise<string> {
    return createBackup(this.connection);
  }

  async listBackups(): Promise<readonly BackupInfo[]> {
    return listBackups(this.connection);
  }

  async restoreBackup(backupId: string): Promise<void> {
    await this.withTransaction(() => restoreBackup(this.connection, backupId));
  }

  async readBackupSnapshot(backupId: string): Promise<StateSnapshot> {
    return readBackupSnapshot(this.connection, backupId);
  }
}
