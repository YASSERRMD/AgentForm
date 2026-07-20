import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Snapshots the database to `backupsDir/state-<timestamp>.db` (§10 "State
 * backup before mutations"), returning the backup's filename as its ID.
 * Checkpoints the WAL first (`TRUNCATE` mode) so the single `.db` file
 * being copied is a complete, consistent snapshot — copying it mid-WAL
 * would miss whatever hasn't been checkpointed into the main file yet.
 */
export function createBackup(db: DatabaseSync, databasePath: string, backupsDir: string): string {
  mkdirSync(backupsDir, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const id = `state-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  copyFileSync(databasePath, path.join(backupsDir, id));
  return id;
}
