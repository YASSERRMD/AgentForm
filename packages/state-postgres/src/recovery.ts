import type { PoolClient } from 'pg';

/**
 * Marks any apply-history row still `in_progress` as `interrupted` (§10
 * "Recovery after interrupted apply") — mirrors the local backend's own
 * `recoverInterruptedOperations` exactly. Called once on `open()`, after
 * migrations: an `in_progress` row that's still there means the process
 * that started it never called `recordApplyFinish`, most likely because
 * it crashed or was killed mid-apply. Returns how many rows were
 * recovered.
 */
export async function recoverInterruptedOperations(client: PoolClient): Promise<number> {
  const result = await client.query(
    "UPDATE apply_history SET status = 'interrupted', finished_at = $1 WHERE status = 'in_progress'",
    [new Date().toISOString()],
  );
  return result.rowCount ?? 0;
}
