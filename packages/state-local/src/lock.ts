import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { StateLockError, type LockInfo } from '@agentform/state';

const DEFAULT_STALE_TIMEOUT_MS = 10 * 60 * 1000;

export interface AcquireLockOptions {
  readonly reason?: string;
  readonly staleTimeoutMs?: number;
}

function holderIdentity(): string {
  return `${process.pid}@${os.hostname()}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function readLock(lockPath: string): LockInfo | undefined {
  if (!existsSync(lockPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
  } catch {
    // A corrupted lock file is treated as absent, not as a permanent
    // deadlock — a caller can still take over rather than being stuck
    // forever behind unreadable state.
    return undefined;
  }
}

function isStale(lock: LockInfo, staleTimeoutMs: number): boolean {
  return Date.now() - new Date(lock.acquiredAt).getTime() > staleTimeoutMs;
}

function tryWriteLock(lockPath: string, info: LockInfo): boolean {
  try {
    writeFileSync(lockPath, JSON.stringify(info), { flag: 'wx' });
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

/**
 * Acquires the file lock at `lockPath` via exclusive create (`wx` —
 * `writeFileSync` fails with `EEXIST` if the file already exists), which
 * is atomic at the filesystem level and needs no separate coordination
 * mechanism. A live holder (younger than `staleTimeoutMs`, default 10
 * minutes) causes `StateLockError`; an older or unreadable/corrupted lock
 * is taken over. Taking over a stale lock has a narrow, acknowledged race
 * (another process could grab it in between the removal and the retry) —
 * acceptable for a local, single-machine state backend; the retry simply
 * fails with `StateLockError` rather than looping if that happens.
 */
export function acquireLock(lockPath: string, options: AcquireLockOptions = {}): void {
  const staleTimeoutMs = options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
  const info: LockInfo = {
    holder: holderIdentity(),
    acquiredAt: new Date().toISOString(),
    reason: options.reason,
  };

  if (tryWriteLock(lockPath, info)) {
    return;
  }

  const existing = readLock(lockPath);
  if (existing && !isStale(existing, staleTimeoutMs)) {
    throw new StateLockError(
      `State is locked by ${existing.holder} (since ${existing.acquiredAt})${existing.reason ? `: ${existing.reason}` : ''}`,
      existing,
    );
  }

  rmSync(lockPath, { force: true });
  if (!tryWriteLock(lockPath, info)) {
    const racedHolder = readLock(lockPath) ?? info;
    throw new StateLockError(
      'State lock was taken by another process while recovering a stale lock',
      racedHolder,
    );
  }
}

export function releaseLock(lockPath: string): void {
  rmSync(lockPath, { force: true });
}
