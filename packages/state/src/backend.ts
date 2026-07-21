import type {
  ApplicationState,
  ApplyHistoryEntry,
  ApplyOperationStatus,
  BackupInfo,
  DriftStatus,
  ResourceState,
  StateSnapshot,
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

  /** Runs `fn` inside a single atomic transaction — every write `fn` makes commits together, or (if `fn` throws) none of them do. §10 "Atomic transactions" / the Phase 11 acceptance criterion "Apply cannot partially corrupt state": `agentform apply`'s final state-persistence step (writing every changed `ResourceState`, the new `ApplicationState`, and finishing the apply-history record) runs inside one call to this. */
  withTransaction<T>(fn: () => Promise<T> | T): Promise<T>;

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

  /** Updates only `driftStatus`/`driftCheckedAt` on the application-state row, leaving every other field untouched — the narrow mutation `agentform drift` uses, as opposed to `putApplicationState`'s full-record upsert. Throws if no application state exists yet (nothing has ever been applied). */
  recordDriftStatus(status: DriftStatus, checkedAt: string): Promise<void>;

  /** Snapshots the current state to a backup, returning an identifier a future restore/rollback can reference. */
  createBackup(): Promise<string>;
  /** Lists every backup this state directory has, newest first. */
  listBackups(): Promise<readonly BackupInfo[]>;
  /**
   * Restores the database to exactly the snapshot `backupId` names,
   * discarding everything written since — **including apply history**,
   * since this replaces the entire database file. This is a disaster-
   * recovery primitive ("state.db is corrupted or unusable, restore the
   * last known-good snapshot wholesale"), not what `agentform rollback`
   * uses — rollback must never erase audit history (§15.13 acceptance
   * criterion), so it reads a snapshot's resource/application state via
   * `readBackupSnapshot` and applies just that, appending a new history
   * record rather than replacing the file. Throws if `backupId` doesn't
   * exist. The backend remains open and usable immediately afterward —
   * callers do not need to reopen it.
   */
  restoreBackup(backupId: string): Promise<void>;
  /** Reads a backup's `application_state`/`resource_states` content without touching the live database at all — the read side `agentform rollback` uses to compute what to restore, leaving the live apply-history table (and everything else) untouched. Throws if `backupId` doesn't exist. */
  readBackupSnapshot(backupId: string): Promise<StateSnapshot>;
}
