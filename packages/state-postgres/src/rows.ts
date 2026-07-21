import type {
  ApplicationState,
  ApplyHistoryEntry,
  ApplyOperationStatus,
  DriftStatus,
  ResourceState,
} from '@agentform/state';
import type { PoolClient } from 'pg';

/**
 * Row-shape mappers shared across the backend, `backup.ts`, and tests.
 * Unlike `@agentform/state-local`'s equivalents, these never need a
 * manual `JSON.parse`/`JSON.stringify` round-trip for array/object
 * columns — `pg` decodes `JSONB` columns into real JS values already.
 */

interface ApplicationStateRow {
  application_name: string;
  environment: string;
  specification_hash: string;
  ir_hash: string;
  schema_version: string;
  adapter_versions: Record<string, string>;
  deployment_identifiers: Record<string, string>;
  last_applied_at: string | null;
  drift_status: string;
  drift_checked_at: string | null;
}

function rowToApplicationState(row: ApplicationStateRow): ApplicationState {
  return {
    applicationName: row.application_name,
    environment: row.environment,
    specificationHash: row.specification_hash,
    irHash: row.ir_hash,
    schemaVersion: row.schema_version,
    adapterVersions: row.adapter_versions,
    deploymentIdentifiers: row.deployment_identifiers,
    lastAppliedAt: row.last_applied_at ?? undefined,
    driftStatus: row.drift_status as DriftStatus,
    driftCheckedAt: row.drift_checked_at ?? undefined,
  };
}

export async function queryApplicationState(
  client: PoolClient,
): Promise<ApplicationState | undefined> {
  const result = await client.query<ApplicationStateRow>(
    'SELECT * FROM application_state WHERE id = 1',
  );
  const row = result.rows[0];
  return row ? rowToApplicationState(row) : undefined;
}

interface ResourceStateRow {
  address: string;
  kind: string;
  content_hash: string;
  identity_hash: string;
  depends_on: readonly string[];
  last_applied_at: string;
}

function rowToResourceState(row: ResourceStateRow): ResourceState {
  return {
    address: row.address,
    kind: row.kind as ResourceState['kind'],
    contentHash: row.content_hash,
    identityHash: row.identity_hash,
    dependsOn: row.depends_on,
    lastAppliedAt: row.last_applied_at,
  };
}

export async function queryResourceStates(client: PoolClient): Promise<readonly ResourceState[]> {
  const result = await client.query<ResourceStateRow>(
    'SELECT * FROM resource_states ORDER BY address',
  );
  return result.rows.map(rowToResourceState);
}

interface ApplyHistoryRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  plan_hash: string | null;
  backup_id: string | null;
  summary: string | null;
}

export function rowToApplyHistoryEntry(row: ApplyHistoryRow): ApplyHistoryEntry {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    status: row.status as ApplyOperationStatus,
    planHash: row.plan_hash ?? undefined,
    backupId: row.backup_id ?? undefined,
    summary: row.summary ?? undefined,
  };
}
