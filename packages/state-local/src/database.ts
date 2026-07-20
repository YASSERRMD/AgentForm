import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { loadSqliteModule } from './sqlite-module.js';

/** Opens (creating if needed) the SQLite database at `databasePath`, ensuring its parent directory exists first. WAL journal mode so concurrent readers don't block a writer mid-transaction. */
export function openDatabase(databasePath: string): DatabaseSyncType {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const { DatabaseSync } = loadSqliteModule();
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
