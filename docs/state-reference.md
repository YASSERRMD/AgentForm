# Agentform state engine

## Purpose

`@agentform/state` defines the backend-agnostic `StateBackend` interface and the data shapes it stores (§10). `@agentform/state-local` is the one implementation that exists today: a SQLite-backed local state store under a project's `.agentform/` directory. `agentform plan`/`agentform status` read it; `agentform apply`/`agentform drift`/`agentform rollback`/`agentform destroy` (`docs/cli-reference.md`, ADR-0012, ADR-0013) are the commands that actually mutate it.

## Minimal example

```ts
import { SqliteStateBackend } from '@agentform/state-local';

const backend = new SqliteStateBackend({ stateDir: '.agentform' });
await backend.open(); // creates state.db if needed, runs migrations, recovers any interrupted apply

const resources = await backend.listResourceStates();
await backend.close();
```

## What's stored, and what deliberately isn't

Every field §10 requires, via `StateBackend`'s methods:

| §10 requirement                                              | Where                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application identity, environment, schema version            | `ApplicationState` (`getApplicationState`/`putApplicationState`)                                                                                                                                                                                                 |
| Specification hash, IR hash                                  | `ApplicationState.specificationHash`/`irHash`                                                                                                                                                                                                                    |
| Adapter versions, deployment identifiers                     | `ApplicationState.adapterVersions`/`deploymentIdentifiers`                                                                                                                                                                                                       |
| Resource states, resource dependencies                       | `ResourceState` (`listResourceStates`/`getResourceState`/`putResourceState`/`deleteResourceState`)                                                                                                                                                               |
| Apply history                                                | `ApplyHistoryEntry` (`recordApplyStart`/`recordApplyFinish`/`listApplyHistory`) — a single append-only log shared by `apply`, `rollback`, and `destroy` (ADR-0013), distinguished by each entry's `summary` text                                                 |
| Lock information                                             | `LockInfo`, `.agentform/lock`                                                                                                                                                                                                                                    |
| Drift status                                                 | `ApplicationState.driftStatus`/`driftCheckedAt` (`'unknown' \| 'in_sync' \| 'drifted'`) — cached by `agentform drift`, reset to `'unknown'` on every `apply` (ADR-0012)                                                                                          |
| Generated artifact hashes, rollback snapshots, output values | `ApplyHistoryEntry.backupId` + `createBackup()`/`listBackups()`/`readBackupSnapshot()` for snapshots (ADR-0013); artifact hashes live in each target's on-disk `generated/<target>/manifest.json`, not in state.db; output values remain unpopulated (see Scope) |

**`ResourceState` never contains a resource's actual value — only two hashes.** `contentHash` covers the whole resource; `identityHash` covers only its identity-defining fields (a tool's `type`, a model's `provider`). This is what makes "never store raw secret values; store secret reference metadata only" (§10) true by construction rather than by a redaction step that has to stay correct forever: there is no field anywhere in this shape that _could_ hold a secret, because there's no field that holds arbitrary resource content at all. See ADR-0008 for the full reasoning, including what this trades away (precise field-level plan diffs and a few of §9's risk rules — `@agentform/planner`'s docs cover the specifics).

## SQLite backend details

- **Driver**: Node's built-in `node:sqlite` (`DatabaseSync`), not a native dependency — avoids every install needing a working native-compilation toolchain. It's still `ExperimentalWarning`-flagged in the Node versions this targets; `sqlite-module.ts` suppresses _only_ that specific warning for the duration of the import, so a CLI user never sees it, while every other Node warning still prints normally.
- **Migrations**: a `schema_migrations` table tracks applied versions; `runMigrations()` (`open()` calls this automatically) applies each pending migration in its own transaction, rolling back and raising `StateMigrationError` on the first failure. Migration v2 (Phase 11) adds `drift_status`/`drift_checked_at` columns to `application_state`, defaulting existing rows to `'unknown'`.
- **Locking**: `.agentform/lock`, acquired via exclusive file creation (atomic at the filesystem level — no separate coordination needed). A lock held longer than `staleTimeoutMs` (default 10 minutes) is treated as abandoned and taken over rather than blocking forever. `agentform plan`/`agentform status`/`agentform drift`/`agentform import` never acquire it — they're read-only (`drift` reads current state and caches its result via a narrow `recordDriftStatus` write, not the lock-guarded path); `agentform apply`/`agentform rollback`/`agentform destroy` (Phase 11, ADR-0012/ADR-0013) do, for the whole duration of their mutation, released in a `finally` even on failure.
- **Multi-write transactions**: `withTransaction<T>(fn)` (Phase 11) runs `fn` and commits every write it made atomically, or — if `fn` throws — none of them. `apply`'s final persistence step (every changed `ResourceState` plus the new `ApplicationState`) and `rollback`'s state-restoration step both run inside exactly one call to this, which is what makes "apply/rollback cannot partially corrupt state" true structurally (ADR-0012).
- **Backups**: `createBackup()` checkpoints the WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) before copying `state.db`, so the copied file is a complete, consistent snapshot rather than missing whatever hadn't been checkpointed yet. `apply`/`rollback`/`destroy` all call this before making any change, giving every mutation an undo point. `listBackups()` lists every backup newest-first; `restoreBackup(backupId)` replaces the entire live database with one (disaster recovery only — discards every `apply_history` row written since, so `agentform rollback` never uses it); `readBackupSnapshot(backupId)` reads a backup's content in isolation without ever touching the live database — the read side `agentform rollback` actually uses (ADR-0013).
- **Crash recovery**: on `open()`, any `apply_history` row still `in_progress` is marked `interrupted` — that status can only mean the process that started it never called `recordApplyFinish`, almost always because it crashed or was killed mid-apply.

## Scope

- No remote backend yet — `@agentform/state-postgres` is Phase 12 scope. `StateBackend`'s fully-async interface exists specifically so that backend can be a drop-in implementation later, not a breaking redesign.
- No encryption hooks yet (§6.6 lists this for "initial local state") — `state.db` is a plain SQLite file on disk today, protected only by normal filesystem permissions.
- Output values remain modeled (the shape exists) but not yet meaningfully populated — nothing produces real output values yet. Generated-artifact hashes now live in each target's own `generated/<target>/manifest.json` on disk (compared against the current IR by `agentform drift`'s artifact-drift check, ADR-0012), not in `state.db` itself. Rollback snapshots are fully populated as of Phase 11 via `createBackup()`/`readBackupSnapshot()`.
- `ApplicationState.driftStatus` is a cache, not a live signal — it only reflects reality as of the last `agentform drift` run (or is reset to `'unknown'` by the next `apply`). Nothing recomputes it automatically or on a schedule.

## Security implications

- No raw resource values (and therefore no secrets) are ever written to `state.db` — see "What's stored" above.
- File locking is a coordination mechanism for well-behaved concurrent `agentform` processes on the same machine, not a security boundary — normal filesystem permissions are what actually restrict who can read/write `.agentform/`.
- `withTransaction` makes every mutating command's persistence step atomic; `createBackup()` before every mutation, plus `readBackupSnapshot`'s isolation from the live `apply_history` table, are what make `agentform rollback` able to undo a bad `apply` (or a bad `destroy`) without ever erasing the audit trail (ADR-0013).
- See `docs/security/threat-model.md` for the full cross-package picture.

## Troubleshooting

- **`StateLockError` you didn't expect**: another `agentform` process (or one that crashed within the last `staleTimeoutMs`, default 10 minutes) holds `.agentform/lock`. Wait for it to finish, or — once the timeout passes — the next attempt takes over automatically.
- **`StateMigrationError` on `open()`**: a migration failed partway; the error message names which one. The database is left at whatever version successfully applied before the failure (each migration is its own transaction), not partially migrated.
- **`agentform status` shows `Drift: never checked` right after a successful `apply`**: expected — every `apply` resets `driftStatus` to `'unknown'`, since the freshly-applied state is a new baseline nothing has compared against yet. Run `agentform drift` to populate it.
- **A backup you expected to restore from is missing**: `listBackups()` (surfaced by `agentform rollback`'s error messages) only ever lists what `createBackup()` has actually written to `.agentform/backups/` — a backup is created before every `apply`/`rollback`/`destroy`, never on a schedule, so a project that's never had one of those commands run has no backups yet.
- **`.agentform/state.db-wal` / `.agentform/state.db-shm` sitting around**: normal — SQLite's WAL-mode sidecar files. They're checkpointed into `state.db` before any backup and cleaned up when the database is closed cleanly.
