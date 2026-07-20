import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateLockError } from '@agentform/state';
import { acquireLock, releaseLock } from './lock.js';

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'agentform-state-local-lock-'));
  lockPath = path.join(dir, 'lock');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('acquireLock / releaseLock', () => {
  it('acquires an uncontended lock, writing holder/acquiredAt', () => {
    acquireLock(lockPath, { reason: 'agentform plan' });
    expect(existsSync(lockPath)).toBe(true);
    const info = JSON.parse(readFileSync(lockPath, 'utf-8')) as { holder: string; reason: string };
    expect(info.holder).toContain(String(process.pid));
    expect(info.reason).toBe('agentform plan');
  });

  it('releasing removes the lock file', () => {
    acquireLock(lockPath);
    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releasing a lock that was never acquired does not throw', () => {
    expect(() => releaseLock(lockPath)).not.toThrow();
  });

  it('rejects a second acquire while a live lock is held (contention)', () => {
    acquireLock(lockPath, { reason: 'first holder' });
    expect(() => acquireLock(lockPath, { reason: 'second holder' })).toThrow(StateLockError);
  });

  it('the contention error carries the existing holder info', () => {
    acquireLock(lockPath, { reason: 'first holder' });
    try {
      acquireLock(lockPath);
      expect.unreachable('acquireLock should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StateLockError);
      expect((error as StateLockError).holder.reason).toBe('first holder');
    }
  });

  it('takes over a stale lock instead of rejecting', () => {
    const staleInfo = {
      holder: 'stale-pid@some-host',
      acquiredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      reason: 'abandoned',
    };
    writeFileSync(lockPath, JSON.stringify(staleInfo), { flag: 'wx' });

    expect(() => acquireLock(lockPath, { staleTimeoutMs: 1000 })).not.toThrow();
    const info = JSON.parse(readFileSync(lockPath, 'utf-8')) as { holder: string };
    expect(info.holder).toContain(String(process.pid));
  });

  it('does not take over a lock younger than the stale timeout', () => {
    const recentInfo = { holder: 'other@host', acquiredAt: new Date().toISOString() };
    writeFileSync(lockPath, JSON.stringify(recentInfo), { flag: 'wx' });

    expect(() => acquireLock(lockPath, { staleTimeoutMs: 60 * 60 * 1000 })).toThrow(StateLockError);
  });

  it('takes over a corrupted/unreadable lock file rather than deadlocking forever', () => {
    writeFileSync(lockPath, 'not valid json', { flag: 'wx' });
    expect(() => acquireLock(lockPath)).not.toThrow();
  });

  it('re-acquiring after release succeeds', () => {
    acquireLock(lockPath);
    releaseLock(lockPath);
    expect(() => acquireLock(lockPath)).not.toThrow();
  });
});
