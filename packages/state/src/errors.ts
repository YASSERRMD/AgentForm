import type { LockInfo } from './types.js';

/** Thrown when acquiring the state lock fails because another (live, non-stale) holder already has it. */
export class StateLockError extends Error {
  readonly holder: LockInfo;

  constructor(message: string, holder: LockInfo) {
    super(message);
    this.name = 'StateLockError';
    this.holder = holder;
  }
}

/** Thrown when the on-disk state's schema version is newer than this backend understands, or migration itself fails partway. */
export class StateMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMigrationError';
  }
}
