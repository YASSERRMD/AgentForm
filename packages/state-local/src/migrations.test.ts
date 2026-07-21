import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { currentSchemaVersion, MIGRATIONS, runMigrations } from './migrations.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentform-state-local-migrations-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('applies every migration to a fresh database', () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    const result = runMigrations(db);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version);
    expect(currentSchemaVersion(db)).toBe(result.toVersion);
    db.close();
  });

  it('creates the tables the initial migration declares', () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['application_state', 'apply_history', 'resource_states']),
    );
    db.close();
  });

  it('is idempotent: running twice on an already-migrated database is a no-op', () => {
    const dbPath = path.join(dir, 'state.db');
    const first = openDatabase(dbPath);
    const firstResult = runMigrations(first);
    first.close();

    const second = openDatabase(dbPath);
    const secondResult = runMigrations(second);
    expect(secondResult.fromVersion).toBe(firstResult.toVersion);
    expect(secondResult.toVersion).toBe(firstResult.toVersion);
    second.close();
  });

  it('persists the applied version across a close/reopen', () => {
    const dbPath = path.join(dir, 'state.db');
    const first = openDatabase(dbPath);
    runMigrations(first);
    first.close();

    const second = openDatabase(dbPath);
    expect(currentSchemaVersion(second)).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version);
    second.close();
  });

  it("migration 2 adds drift_status (defaulting to 'unknown') and drift_checked_at to application_state", () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    runMigrations(db);
    db.prepare(
      "INSERT INTO application_state (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers) VALUES (1, 'app', 'dev', 'spec', 'ir', '1', '{}', '{}')",
    ).run();
    const row = db
      .prepare('SELECT drift_status, drift_checked_at FROM application_state WHERE id = 1')
      .get();
    expect(row).toEqual({ drift_status: 'unknown', drift_checked_at: null });
    db.close();
  });
});
