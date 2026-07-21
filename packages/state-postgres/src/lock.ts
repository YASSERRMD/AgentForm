import os from 'node:os';
import { StateLockError, type LockInfo } from '@agentform/state';
import type { PoolClient } from 'pg';

const DEFAULT_STALE_TIMEOUT_MS = 10 * 60 * 1000;

export interface AcquireLockOptions {
  readonly reason?: string;
  readonly staleTimeoutMs?: number;
}

function holderIdentity(): string {
  return `${process.pid}@${os.hostname()}`;
}

interface LockRow {
  holder: string;
  acquired_at: string;
  reason: string | null;
}

function rowToLockInfo(row: LockRow): LockInfo {
  return { holder: row.holder, acquiredAt: row.acquired_at, reason: row.reason ?? undefined };
}

function isStale(lock: LockInfo, staleTimeoutMs: number): boolean {
  return Date.now() - new Date(lock.acquiredAt).getTime() > staleTimeoutMs;
}

/**
 * Acquires `state_lock`'s single row (`id = 1`) via `INSERT ... ON
 * CONFLICT DO NOTHING` — Postgres's atomic equivalent to the local
 * backend's atomic exclusive file creation (`lock.ts`'s own doc comment).
 * A live holder (younger than `staleTimeoutMs`) raises `StateLockError`.
 * An older holder is taken over via a conditional `UPDATE ... WHERE
 * acquired_at = $oldValue` — a compare-and-swap using the stale row's own
 * `acquired_at` as the condition, so of two processes racing to take over
 * the same stale lock, only the first `UPDATE` actually matches a row
 * (it changes `acquired_at`, so the second process's identical `WHERE`
 * clause matches zero rows and correctly reports contention instead of
 * both believing they'd won).
 */
export async function acquireLock(
  client: PoolClient,
  options: AcquireLockOptions = {},
): Promise<void> {
  const staleTimeoutMs = options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
  const info: LockInfo = {
    holder: holderIdentity(),
    acquiredAt: new Date().toISOString(),
    reason: options.reason,
  };

  const inserted = await client.query<LockRow>(
    `INSERT INTO state_lock (id, holder, acquired_at, reason) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO NOTHING
     RETURNING holder, acquired_at, reason`,
    [info.holder, info.acquiredAt, info.reason ?? null],
  );
  if (inserted.rows.length > 0) {
    return;
  }

  const existingResult = await client.query<LockRow>(
    'SELECT holder, acquired_at, reason FROM state_lock WHERE id = 1',
  );
  const existing = existingResult.rows[0] ? rowToLockInfo(existingResult.rows[0]) : undefined;

  if (existing && !isStale(existing, staleTimeoutMs)) {
    throw new StateLockError(
      `State is locked by ${existing.holder} (since ${existing.acquiredAt})${existing.reason ? `: ${existing.reason}` : ''}`,
      existing,
    );
  }

  const takeover = await client.query(
    `UPDATE state_lock SET holder = $1, acquired_at = $2, reason = $3
     WHERE id = 1 AND acquired_at = $4
     RETURNING holder`,
    [info.holder, info.acquiredAt, info.reason ?? null, existing?.acquiredAt ?? null],
  );
  if (takeover.rowCount === 0) {
    const racedResult = await client.query<LockRow>(
      'SELECT holder, acquired_at, reason FROM state_lock WHERE id = 1',
    );
    const racedHolder = racedResult.rows[0] ? rowToLockInfo(racedResult.rows[0]) : info;
    throw new StateLockError(
      'State lock was taken by another process while recovering a stale lock',
      racedHolder,
    );
  }
}

export async function releaseLock(client: PoolClient): Promise<void> {
  await client.query('DELETE FROM state_lock WHERE id = 1');
}
