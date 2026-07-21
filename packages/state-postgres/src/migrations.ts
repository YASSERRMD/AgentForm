import { StateMigrationError } from '@agentform/state';
import type { PoolClient } from 'pg';

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (client: PoolClient) => Promise<void>;
}

/**
 * Unlike `@agentform/state-local`'s two-migration history (a real
 * artifact of drift status being added in a later phase than the rest of
 * the schema), this package starts at its current, complete shape in a
 * single migration — there is no earlier released version of
 * `@agentform/state-postgres` to have left partial schema behind.
 * `depends_on`/`adapter_versions`/`deployment_identifiers` use native
 * `JSONB` rather than `TEXT`-encoded JSON (SQLite has no JSON type;
 * Postgres does) — the driver decodes them back into real objects/arrays
 * without a manual `JSON.parse` step. `state_lock` and `state_backups`
 * are real tables (not files, unlike the local backend) — see `lock.ts`/
 * `backup.ts` for why each needs the shape it has.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description:
      'initial schema: application_state, resource_states, apply_history, state_lock, state_backups',
    up: async (client) => {
      await client.query(`
        CREATE TABLE application_state (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          application_name TEXT NOT NULL,
          environment TEXT NOT NULL,
          specification_hash TEXT NOT NULL,
          ir_hash TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          adapter_versions JSONB NOT NULL,
          deployment_identifiers JSONB NOT NULL,
          last_applied_at TEXT,
          drift_status TEXT NOT NULL DEFAULT 'unknown',
          drift_checked_at TEXT
        );

        CREATE TABLE resource_states (
          address TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          identity_hash TEXT NOT NULL,
          depends_on JSONB NOT NULL,
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

        CREATE TABLE state_lock (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          holder TEXT NOT NULL,
          acquired_at TEXT NOT NULL,
          reason TEXT
        );

        CREATE TABLE state_backups (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          application_state JSONB,
          resource_states JSONB NOT NULL
        );
      `);
    },
  },
];

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
}

export async function currentSchemaVersion(client: PoolClient): Promise<number> {
  await ensureMigrationsTable(client);
  const result = await client.query<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  return result.rows[0]?.version ?? 0;
}

export interface MigrationRunResult {
  readonly fromVersion: number;
  readonly toVersion: number;
}

/** Applies every pending migration, each in its own transaction, stopping (and rolling that one migration back) at the first failure — mirrors `@agentform/state-local`'s `runMigrations` exactly, translated to `pg`'s async client API. */
export async function runMigrations(client: PoolClient): Promise<MigrationRunResult> {
  await ensureMigrationsTable(client);
  const fromVersion = await currentSchemaVersion(client);
  const pending = [...MIGRATIONS]
    .filter((migration) => migration.version > fromVersion)
    .sort((a, b) => a.version - b.version);

  let toVersion = fromVersion;
  for (const migration of pending) {
    await client.query('BEGIN');
    try {
      await migration.up(client);
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
        migration.version,
        new Date().toISOString(),
      ]);
      await client.query('COMMIT');
      toVersion = migration.version;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new StateMigrationError(
        `Migration ${migration.version} ("${migration.description}") failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { fromVersion, toVersion };
}
