import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, listBackups, restoreBackup } from './backup.js';
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
    const row = restored
      .prepare('SELECT application_name FROM application_state WHERE id = 1')
      .get();
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

describe('listBackups', () => {
  it('returns an empty list when backupsDir does not exist yet', () => {
    expect(listBackups(path.join(dir, 'backups'))).toEqual([]);
  });

  it('lists every backup with a real size and a valid ISO createdAt', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);
    const id = createBackup(db, databasePath, backupsDir);
    db.close();

    const backups = listBackups(backupsDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ id });
    expect(backups[0]?.sizeBytes).toBeGreaterThan(0);
    expect(new Date(backups[0]?.createdAt ?? '').toISOString()).toBe(backups[0]?.createdAt);
  });

  it('orders backups newest first', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);
    mkdirSync(backupsDir, { recursive: true });
    // A backup "created" earlier, simulated by writing it directly with an older mtime.
    const olderPath = path.join(backupsDir, 'state-older.db');
    writeFileSync(olderPath, 'not a real db, only mtime matters here');
    const older = new Date('2020-01-01T00:00:00.000Z');
    utimesSync(olderPath, older, older);

    const newerId = createBackup(db, databasePath, backupsDir);
    db.close();

    const backups = listBackups(backupsDir);
    expect(backups[0]?.id).toBe(newerId);
    expect(backups[backups.length - 1]?.id).toBe('state-older.db');
  });
});

describe('restoreBackup', () => {
  it('throws when the named backup does not exist', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    expect(() => restoreBackup(databasePath, backupsDir, 'does-not-exist.db')).toThrow(
      /does not exist/,
    );
  });

  it('restores exactly the backed-up content, discarding writes made after the backup', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);
    db.prepare(
      "INSERT INTO application_state (id, application_name, environment, specification_hash, ir_hash, schema_version, adapter_versions, deployment_identifiers) VALUES (1, 'before-backup', 'dev', 'spec', 'ir', '1', '{}', '{}')",
    ).run();
    const id = createBackup(db, databasePath, backupsDir);

    db.prepare('UPDATE application_state SET application_name = ? WHERE id = 1').run(
      'after-backup',
    );
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();

    restoreBackup(databasePath, backupsDir, id);

    const restored = openDatabase(databasePath);
    const row = restored
      .prepare('SELECT application_name FROM application_state WHERE id = 1')
      .get();
    expect(row).toEqual({ application_name: 'before-backup' });
    restored.close();
  });

  it('removes stale -wal/-shm sidecar files left by the closed connection', () => {
    const databasePath = path.join(dir, 'state.db');
    const backupsDir = path.join(dir, 'backups');
    const db = openDatabase(databasePath);
    runMigrations(db);
    const id = createBackup(db, databasePath, backupsDir);
    db.close();

    writeFileSync(`${databasePath}-wal`, 'stale wal data');
    writeFileSync(`${databasePath}-shm`, 'stale shm data');

    restoreBackup(databasePath, backupsDir, id);

    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  });
});
