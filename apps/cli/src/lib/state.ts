import path from 'node:path';
import { SqliteStateBackend } from '@agentform/state-local';
import { PostgresStateBackend } from '@agentform/state-postgres';
import type { StateBackend } from '@agentform/state';

/** `.agentform/` under the project root — `state.db`, `lock`, `backups/` all live under it (§10's example layout). Only meaningful for the local (SQLite) backend. */
export function stateDirFor(rootDir: string): string {
  return path.join(rootDir, '.agentform');
}

/**
 * Opens (creating/migrating as needed) the configured state backend for
 * `rootDir`. Callers own calling `close()`. Defaults to the local SQLite
 * backend (no configuration needed, matching every phase before this
 * one); set `AGENTFORM_STATE_POSTGRES_URL` to opt into
 * `@agentform/state-postgres` instead (Phase 12's remote-state package)
 * — there is deliberately no spec-level field for this yet (§6.9's
 * `spec.deployment` is about deployment *targets*, not state *storage*,
 * and this is the smallest real integration point without inventing a
 * new schema surface a later phase would need to redesign anyway).
 * `AGENTFORM_STATE_POSTGRES_SCHEMA` optionally overrides the Postgres
 * schema tables live under (default `"agentform"`), letting multiple
 * projects share one database without colliding.
 */
export async function openStateBackend(rootDir: string): Promise<StateBackend> {
  const postgresUrl = process.env.AGENTFORM_STATE_POSTGRES_URL;
  const backend = postgresUrl
    ? new PostgresStateBackend({
        connectionString: postgresUrl,
        schema: process.env.AGENTFORM_STATE_POSTGRES_SCHEMA,
      })
    : new SqliteStateBackend({ stateDir: stateDirFor(rootDir) });
  await backend.open();
  return backend;
}
