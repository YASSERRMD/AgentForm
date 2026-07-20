export type ResourceKind = 'model' | 'tool' | 'agent' | 'workflow' | 'memory' | 'output';

/**
 * One tracked resource's last-applied state. Deliberately content-hash
 * based, never the resource's raw value — §10 "Never store raw secret
 * values; store secret reference metadata only" is satisfied by design
 * here: nothing in this shape *can* hold a secret, because nothing in it
 * holds arbitrary resource content at all.
 */
export interface ResourceState {
  readonly address: string;
  readonly kind: ResourceKind;
  readonly contentHash: string;
  /** Other resource addresses this one depends on (e.g. an agent depends on its model and tools) — the planner's dependency-order input. */
  readonly dependsOn: readonly string[];
  readonly lastAppliedAt: string;
}

export interface ApplicationState {
  readonly applicationName: string;
  readonly environment: string;
  readonly specificationHash: string;
  readonly irHash: string;
  readonly schemaVersion: string;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly deploymentIdentifiers: Readonly<Record<string, string>>;
  readonly lastAppliedAt?: string;
}

export type ApplyOperationStatus = 'in_progress' | 'succeeded' | 'failed' | 'interrupted';

/**
 * One row of apply history. `backupId`, when present, names the backup
 * `createBackup()` took immediately before this operation started — the
 * hook a future `agentform rollback` (Phase 11) needs to find "the state
 * right before this apply," without this phase having to implement
 * rollback itself.
 */
export interface ApplyHistoryEntry {
  readonly id: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: ApplyOperationStatus;
  readonly planHash?: string;
  readonly backupId?: string;
  readonly summary?: string;
}

export type DriftStatus = 'unknown' | 'in_sync' | 'drifted';

export interface LockInfo {
  /** `pid@hostname`, or another backend-specific holder identity. */
  readonly holder: string;
  readonly acquiredAt: string;
  readonly reason?: string;
}
