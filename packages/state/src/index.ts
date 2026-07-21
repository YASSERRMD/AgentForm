export type {
  ResourceKind,
  ResourceState,
  ApplicationState,
  ApplyOperationStatus,
  ApplyHistoryEntry,
  DriftStatus,
  BackupInfo,
  StateSnapshot,
  LockInfo,
} from './types.js';
export { StateLockError, StateMigrationError } from './errors.js';
export type { StateBackend, LockOptions, MigrationResult } from './backend.js';

export const PACKAGE_NAME = '@agentform/state';
export const PACKAGE_VERSION = '0.1.0';
