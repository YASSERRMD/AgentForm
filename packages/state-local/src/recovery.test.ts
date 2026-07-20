import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { runMigrations } from './migrations.js';
import { recoverInterruptedOperations } from './recovery.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentform-state-local-recovery-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('recoverInterruptedOperations', () => {
  it('marks an in_progress row as interrupted', () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    runMigrations(db);
    db.prepare(
      "INSERT INTO apply_history (id, started_at, status) VALUES ('apply-1', '2026-01-01T00:00:00.000Z', 'in_progress')",
    ).run();

    const recovered = recoverInterruptedOperations(db);

    expect(recovered).toBe(1);
    const row = db
      .prepare('SELECT status, finished_at FROM apply_history WHERE id = ?')
      .get('apply-1');
    expect(row).toMatchObject({ status: 'interrupted' });
    expect((row as { finished_at: string | null }).finished_at).not.toBeNull();
    db.close();
  });

  it('leaves succeeded/failed rows untouched', () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    runMigrations(db);
    db.prepare(
      "INSERT INTO apply_history (id, started_at, finished_at, status) VALUES ('apply-ok', '2026-01-01T00:00:00.000Z', '2026-01-01T00:01:00.000Z', 'succeeded')",
    ).run();

    const recovered = recoverInterruptedOperations(db);

    expect(recovered).toBe(0);
    const row = db.prepare('SELECT status FROM apply_history WHERE id = ?').get('apply-ok');
    expect(row).toEqual({ status: 'succeeded' });
    db.close();
  });

  it('returns 0 when there is no apply history at all', () => {
    const db = openDatabase(path.join(dir, 'state.db'));
    runMigrations(db);
    expect(recoverInterruptedOperations(db)).toBe(0);
    db.close();
  });
});
