import { StateMigrationError } from '@agentform/state';
import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: DatabaseSync) => void;
}

/**
 * Each migration owns exactly one schema change, applied in order inside
 * its own transaction (§10 "State migration"). `resource_states.depends_on`
 * is stored as a JSON-encoded array string — SQLite has no native array
 * type, and a join table is unwarranted complexity for what's always read
 * back as a whole array, never queried by individual dependency.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'initial schema: application_state, resource_states, apply_history',
    up: (db) => {
      db.exec(`
        CREATE TABLE application_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          application_name TEXT NOT NULL,
          environment TEXT NOT NULL,
          specification_hash TEXT NOT NULL,
          ir_hash TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          adapter_versions TEXT NOT NULL,
          deployment_identifiers TEXT NOT NULL,
          last_applied_at TEXT
        );

        CREATE TABLE resource_states (
          address TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          identity_hash TEXT NOT NULL,
          depends_on TEXT NOT NULL,
          last_applied_at TEXT NOT NULL
        );

        CREATE TABLE apply_history (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          plan_hash TEXT,
          backup_id TEXT,
          summary TEXT
        );
      `);
    },
  },
  {
    version: 2,
    description:
      'add drift_status/drift_checked_at to application_state (Phase 11: agentform drift)',
    up: (db) => {
      db.exec(`
        ALTER TABLE application_state ADD COLUMN drift_status TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE application_state ADD COLUMN drift_checked_at TEXT;
      `);
    },
  },
];

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
}

export function currentSchemaVersion(db: DatabaseSync): number {
  ensureMigrationsTable(db);
  const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
    { version: number | null } | undefined;
  return row?.version ?? 0;
}

export interface MigrationRunResult {
  readonly fromVersion: number;
  readonly toVersion: number;
}

/** Applies every pending migration, each in its own transaction, stopping (and rolling that one migration back) at the first failure. Already-applied migrations are untouched; a from === to result means nothing was pending. */
export function runMigrations(db: DatabaseSync): MigrationRunResult {
  ensureMigrationsTable(db);
  const fromVersion = currentSchemaVersion(db);
  const pending = [...MIGRATIONS]
    .filter((migration) => migration.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  let toVersion = fromVersion;
  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      toVersion = migration.version;
    } catch (error) {
      db.exec('ROLLBACK');
      throw new StateMigrationError(
        `Migration ${migration.version} ("${migration.description}") failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { fromVersion, toVersion };
}
