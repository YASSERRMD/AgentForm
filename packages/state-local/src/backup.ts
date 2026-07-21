import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { BackupInfo } from '@agentform/state';

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

/** Every backup in `backupsDir`, newest first — `[]` if the directory doesn't exist yet (nothing has ever been backed up). */
export function listBackups(backupsDir: string): readonly BackupInfo[] {
  if (!existsSync(backupsDir)) {
    return [];
  }
  return readdirSync(backupsDir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const stats = statSync(path.join(backupsDir, name));
      return { id: name, createdAt: stats.mtime.toISOString(), sizeBytes: stats.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Overwrites `databasePath` with `backupsDir/backupId`, discarding
 * everything written since that snapshot. The caller must have already
 * closed its `DatabaseSync` handle on `databasePath` before calling this
 * (SQLite, particularly in WAL mode, doesn't tolerate its file being
 * replaced out from under an open connection) and must open a fresh one
 * afterward — this function only touches files, never a live handle.
 * Removes any stale `-wal`/`-shm` sidecar files left by the connection
 * that was just closed, since they'd otherwise describe writes against
 * the database that no longer exists after the restore.
 */
export function restoreBackup(databasePath: string, backupsDir: string, backupId: string): void {
  const backupPath = path.join(backupsDir, backupId);
  if (!existsSync(backupPath)) {
    throw new Error(`Backup "${backupId}" does not exist in ${backupsDir}`);
  }
  copyFileSync(backupPath, databasePath);
  for (const sidecar of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(sidecar)) {
      unlinkSync(sidecar);
    }
  }
}
