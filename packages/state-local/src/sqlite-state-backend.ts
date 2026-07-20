import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ApplicationState,
  ApplyHistoryEntry,
  ApplyOperationStatus,
  LockOptions,
  MigrationResult,
  ResourceState,
  StateBackend,
} from '@agentform/state';
import { acquireLock, releaseLock } from './lock.js';
import { createBackup } from './backup.js';
import { openDatabase } from './database.js';
import { currentSchemaVersion, runMigrations } from './migrations.js';
import { recoverInterruptedOperations } from './recovery.js';

export interface SqliteStateBackendOptions {
  /** The `.agentform/` directory — `state.db`, `lock`, and `backups/` all live under it, matching §10's example layout. */
  readonly stateDir: string;
}

function toJsonColumn(value: unknown): string {
  return JSON.stringify(value);
}

function fromJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface ApplicationStateRow {
  application_name: string;
  environment: string;
  specification_hash: string;
  ir_hash: string;
  schema_version: string;
  adapter_versions: string;
  deployment_identifiers: string;
  last_applied_at: string | null;
}

interface ResourceStateRow {
  address: string;
  kind: string;
  content_hash: string;
  identity_hash: string;
  depends_on: string;
  last_applied_at: string;
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

function rowToApplicationState(row: ApplicationStateRow): ApplicationState {
  return {
    applicationName: row.application_name,
    environment: row.environment,
    specificationHash: row.specification_hash,
    irHash: row.ir_hash,
    schemaVersion: row.schema_version,
    adapterVersions: fromJsonColumn(row.adapter_versions, {}),
    deploymentIdentifiers: fromJsonColumn(row.deployment_identifiers, {}),
    lastAppliedAt: row.last_applied_at ?? undefined,
  };
}

function rowToResourceState(row: ResourceStateRow): ResourceState {
  return {
    address: row.address,
    kind: row.kind as ResourceState['kind'],
    contentHash: row.content_hash,
    identityHash: row.identity_hash,
    dependsOn: fromJsonColumn(row.depends_on, []),
    lastAppliedAt: row.last_applied_at,
  };
}

function rowToApplyHistoryEntry(row: ApplyHistoryRow): ApplyHistoryEntry {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    status: row.status as ApplyOperationStatus,
    planHash: row.plan_hash ?? undefined,
    backupId: row.backup_id ?? undefined,
    summary: row.summary ?? undefined,
  };
}

/** SQLite-backed `StateBackend` (`@agentform/state`), storing everything under `options.stateDir` (conventionally `.agentform/`). */
export class SqliteStateBackend implements StateBackend {
  readonly kind = 'sqlite';

  private readonly stateDir: string;
  private readonly databasePath: string;
  private readonly lockPath: string;
  private readonly backupsDir: string;
  private db: DatabaseSync | undefined;

  constructor(options: SqliteStateBackendOptions) {
    this.stateDir = options.stateDir;
    this.databasePath = path.join(this.stateDir, 'state.db');
    this.lockPath = path.join(this.stateDir, 'lock');
    this.backupsDir = path.join(this.stateDir, 'backups');
  }

  private get database(): DatabaseSync {
    if (!this.db) {
      throw new Error('SqliteStateBackend used before open() (or after close())');
    }
    return this.db;
  }

  async open(): Promise<void> {
    this.db = openDatabase(this.databasePath);
    runMigrations(this.db);
    recoverInterruptedOperations(this.db);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = undefined;
  }

  async migrate(): Promise<MigrationResult> {
    return runMigrations(this.database);
  }

  async getSchemaVersion(): Promise<number> {
    return currentSchemaVersion(this.database);
  }

  async acquireLock(options?: LockOptions): Promise<void> {
    acquireLock(this.lockPath, {
      reason: options?.reason,
      staleTimeoutMs: options?.staleTimeoutMs,
    });
  }

  async releaseLock(): Promise<void> {
    releaseLock(this.lockPath);
  }

  async withLock<T>(fn: () => Promise<T> | T, options?: LockOptions): Promise<T> {
    await this.acquireLock(options);
    try {
      return await fn();
    } finally {
      await this.releaseLock();
    }
  }

  async getApplicationState(): Promise<ApplicationState | undefined> {
    const row = this.database
      .prepare('SELECT * FROM application_state WHERE id = 1')
      .get() as unknown as ApplicationStateRow | undefined;
    return row ? rowToApplicationState(row) : undefined;
  }

  async putApplicationState(state: ApplicationState): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO application_state
           (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers, last_applied_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           application_name = excluded.application_name,
           environment = excluded.environment,
           specification_hash = excluded.specification_hash,
           ir_hash = excluded.ir_hash,
           schema_version = excluded.schema_version,
           adapter_versions = excluded.adapter_versions,
           deployment_identifiers = excluded.deployment_identifiers,
           last_applied_at = excluded.last_applied_at`,
      )
      .run(
        state.applicationName,
        state.environment,
        state.specificationHash,
        state.irHash,
        state.schemaVersion,
        toJsonColumn(state.adapterVersions),
        toJsonColumn(state.deploymentIdentifiers),
        state.lastAppliedAt ?? null,
      );
  }

  async listResourceStates(): Promise<readonly ResourceState[]> {
    const rows = this.database
      .prepare('SELECT * FROM resource_states ORDER BY address')
      .all() as unknown as ResourceStateRow[];
    return rows.map(rowToResourceState);
  }

  async getResourceState(address: string): Promise<ResourceState | undefined> {
    const row = this.database
      .prepare('SELECT * FROM resource_states WHERE address = ?')
      .get(address) as unknown as ResourceStateRow | undefined;
    return row ? rowToResourceState(row) : undefined;
  }

  async putResourceState(state: ResourceState): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO resource_states (address, kind, content_hash, identity_hash, depends_on, last_applied_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           kind = excluded.kind,
           content_hash = excluded.content_hash,
           identity_hash = excluded.identity_hash,
           depends_on = excluded.depends_on,
           last_applied_at = excluded.last_applied_at`,
      )
      .run(
        state.address,
        state.kind,
        state.contentHash,
        state.identityHash,
        toJsonColumn(state.dependsOn),
        state.lastAppliedAt,
      );
  }

  async deleteResourceState(address: string): Promise<void> {
    this.database.prepare('DELETE FROM resource_states WHERE address = ?').run(address);
  }

  async recordApplyStart(entry: Omit<ApplyHistoryEntry, 'status'>): Promise<void> {
    this.database
      .prepare(
        `INSERT INTO apply_history (id, started_at, finished_at, status, plan_hash, backup_id, summary)
         VALUES (?, ?, NULL, 'in_progress', ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.startedAt,
        entry.planHash ?? null,
        entry.backupId ?? null,
        entry.summary ?? null,
      );
  }

  async recordApplyFinish(
    id: string,
    status: ApplyOperationStatus,
    summary?: string,
  ): Promise<void> {
    this.database
      .prepare('UPDATE apply_history SET status = ?, finished_at = ?, summary = ? WHERE id = ?')
      .run(status, new Date().toISOString(), summary ?? null, id);
  }

  async listApplyHistory(limit = 50): Promise<readonly ApplyHistoryEntry[]> {
    const rows = this.database
      .prepare('SELECT * FROM apply_history ORDER BY started_at DESC LIMIT ?')
      .all(limit) as unknown as ApplyHistoryRow[];
    return rows.map(rowToApplyHistoryEntry);
  }

  async createBackup(): Promise<string> {
    return createBackup(this.database, this.databasePath, this.backupsDir);
  }
}
