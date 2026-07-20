import path from 'node:path';
import { SqliteStateBackend } from '@agentform/state-local';
import type { StateBackend } from '@agentform/state';

/** `.agentform/` under the project root — `state.db`, `lock`, `backups/` all live under it (§10's example layout). */
export function stateDirFor(rootDir: string): string {
  return path.join(rootDir, '.agentform');
}

/** Opens (creating/migrating as needed) the local state backend for `rootDir`. Callers own calling `close()`. */
export async function openStateBackend(rootDir: string): Promise<StateBackend> {
  const backend = new SqliteStateBackend({ stateDir: stateDirFor(rootDir) });
  await backend.open();
  return backend;
}
