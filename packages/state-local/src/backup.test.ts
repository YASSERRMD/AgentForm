import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup } from './backup.js';
import { openDatabase } from './database.js';
import { runMigrations } from './migrations.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentform-state-local-backup-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createBackup', () => {
  it('creates a backup file under backupsDir and returns its id', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);

    const id = createBackup(db, databasePath, backupsDir);

    expect(existsSync(path.join(backupsDir, id))).toBe(true);
    db.close();
  });

  it('the backup is a valid, openable SQLite database with the same schema', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);
    db.prepare(
      "INSERT INTO application_state (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers) VALUES (1, 'app', 'dev', 'spec', 'ir', '1', '{}', '{}')",
    ).run();

    const id = createBackup(db, databasePath, backupsDir);
    db.close();

    const restored = openDatabase(path.join(backupsDir, id));
    const row = restored.prepare('SELECT application_name FROM application_state WHERE id = 1').get();
    expect(row).toEqual({ application_name: 'app' });
    restored.close();
  });

  it('creates backupsDir if it does not already exist', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'nested', 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);

    createBackup(db, databasePath, backupsDir);

    expect(readdirSync(backupsDir).length).toBeGreaterThan(0);
    db.close();
  });
});
