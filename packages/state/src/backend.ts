import type {
  ApplicationState,
  ApplyHistoryEntry,
  ApplyOperationStatus,
  ResourceState,
} from './types.js';

export interface LockOptions {
  /** Recorded in the lock, surfaced back to whoever hits contention (e.g. "agentform plan"). */
  readonly reason?: string;
  /** How long a lock can be held before a later acquirer is allowed to treat it as abandoned and take over. */
  readonly staleTimeoutMs?: number;
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
}

/**
 * The plugin interface every state backend implements (§11's
 * `StateBackend` plugin type). Every method is async — `@agentform/state-local`'s
 * SQLite implementation happens to be synchronous under the hood
 * (`node:sqlite`'s `DatabaseSync`), but the interface stays async so a
 * future remote backend (`@agentform/state-postgres`, Phase 12) is a
 * drop-in implementation, not a breaking redesign.
 */
export interface StateBackend {
  /** A short, stable identifier for what this backend is (e.g. `'sqlite'`), surfaced by `agentform status`. */
  readonly kind: string;

  open(): Promise<void>;
  close(): Promise<void>;

  /** Applies any pending schema migrations, in order, and returns the version range covered. A no-op (fromVersion === toVersion) when already current. */
  migrate(): Promise<MigrationResult>;
  getSchemaVersion(): Promise<number>;

  /** Acquires the state lock, rejecting with `StateLockError` if another live holder already has it (a holder past `staleTimeoutMs` is treated as abandoned and taken over instead). */
  acquireLock(options?: LockOptions): Promise<void>;
  releaseLock(): Promise<void>;
  /** Acquires, runs `fn`, and always releases afterward — including when `fn` throws. */
  withLock<T>(fn: () => Promise<T> | T, options?: LockOptions): Promise<T>;

  getApplicationState(): Promise<ApplicationState | undefined>;
  putApplicationState(state: ApplicationState): Promise<void>;

  listResourceStates(): Promise<readonly ResourceState[]>;
  getResourceState(address: string): Promise<ResourceState | undefined>;
  putResourceState(state: ResourceState): Promise<void>;
  deleteResourceState(address: string): Promise<void>;

  /** Records a new apply-history row with `status: 'in_progress'`. */
  recordApplyStart(entry: Omit<ApplyHistoryEntry, 'status'>): Promise<void>;
  recordApplyFinish(id: string, status: ApplyOperationStatus, summary?: string): Promise<void>;
  listApplyHistory(limit?: number): Promise<readonly ApplyHistoryEntry[]>;

  /** Snapshots the current state to a backup, returning an identifier a future restore/rollback can reference. */
  createBackup(): Promise<string>;
}
