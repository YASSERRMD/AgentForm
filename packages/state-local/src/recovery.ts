import type { DatabaseSync } from 'node:sqlite';

/**
 * Marks any apply-history row still `in_progress` as `interrupted` (§10
 * "Recovery after interrupted apply"). Called once on `open()`, after
 * migrations: an `in_progress` row that's still there means the process
 * that started it never called `recordApplyFinish` — most likely because
 * it crashed or was killed mid-apply, since a normally-completed apply
 * always transitions to `succeeded`/`failed` before the process exits.
 * Returns how many rows were recovered, so a caller can surface "recovered
 * N interrupted operation(s)" to the user rather than silently rewriting
 * history.
 */
export function recoverInterruptedOperations(db: DatabaseSync): number {
  const result = db
    .prepare("UPDATE apply_history SET status = 'interrupted', finished_at = ? WHERE status = 'in_progress'")
    .run(new Date().toISOString());
  return Number(result.changes);
}
