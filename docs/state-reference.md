# Agentform state engine

## Purpose

`@agentform/state` defines the backend-agnostic `StateBackend` interface and the data shapes it stores (§10). `@agentform/state-local` is the one implementation that exists today: a SQLite-backed local state store under a project's `.agentform/` directory. `agentform plan`/`agentform status` (`docs/cli-reference.md`) are the current consumers; `agentform apply` (Phase 11) will be the first to actually mutate state through it.

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

| §10 requirement                                              | Where                                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application identity, environment, schema version            | `ApplicationState` (`getApplicationState`/`putApplicationState`)                                                                                  |
| Specification hash, IR hash                                  | `ApplicationState.specificationHash`/`irHash`                                                                                                     |
| Adapter versions, deployment identifiers                     | `ApplicationState.adapterVersions`/`deploymentIdentifiers`                                                                                        |
| Resource states, resource dependencies                       | `ResourceState` (`listResourceStates`/`getResourceState`/`putResourceState`/`deleteResourceState`)                                                |
| Apply history                                                | `ApplyHistoryEntry` (`recordApplyStart`/`recordApplyFinish`/`listApplyHistory`)                                                                   |
| Lock information                                             | `LockInfo`, `.agentform/lock`                                                                                                                     |
| Generated artifact hashes, rollback snapshots, output values | Hooked via `ApplyHistoryEntry.backupId` + `createBackup()` — full population starts with the apply engine (Phase 11) that actually produces these |

**`ResourceState` never contains a resource's actual value — only two hashes.** `contentHash` covers the whole resource; `identityHash` covers only its identity-defining fields (a tool's `type`, a model's `provider`). This is what makes "never store raw secret values; store secret reference metadata only" (§10) true by construction rather than by a redaction step that has to stay correct forever: there is no field anywhere in this shape that _could_ hold a secret, because there's no field that holds arbitrary resource content at all. See ADR-0008 for the full reasoning, including what this trades away (precise field-level plan diffs and a few of §9's risk rules — `@agentform/planner`'s docs cover the specifics).

## SQLite backend details

- **Driver**: Node's built-in `node:sqlite` (`DatabaseSync`), not a native dependency — avoids every install needing a working native-compilation toolchain. It's still `ExperimentalWarning`-flagged in the Node versions this targets; `sqlite-module.ts` suppresses _only_ that specific warning for the duration of the import, so a CLI user never sees it, while every other Node warning still prints normally.
- **Migrations**: a `schema_migrations` table tracks applied versions; `runMigrations()` (`open()` calls this automatically) applies each pending migration in its own transaction, rolling back and raising `StateMigrationError` on the first failure.
- **Locking**: `.agentform/lock`, acquired via exclusive file creation (atomic at the filesystem level — no separate coordination needed). A lock held longer than `staleTimeoutMs` (default 10 minutes) is treated as abandoned and taken over rather than blocking forever. `agentform plan`/`agentform status` never acquire it — they're read-only; only a future mutating command (`apply`, Phase 11) will.
- **Backups**: `createBackup()` checkpoints the WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) before copying `state.db`, so the copied file is a complete, consistent snapshot rather than missing whatever hadn't been checkpointed yet.
- **Crash recovery**: on `open()`, any `apply_history` row still `in_progress` is marked `interrupted` — that status can only mean the process that started it never called `recordApplyFinish`, almost always because it crashed or was killed mid-apply.

## Scope

- No remote backend yet — `@agentform/state-postgres` is Phase 12 scope. `StateBackend`'s fully-async interface exists specifically so that backend can be a drop-in implementation later, not a breaking redesign.
- No encryption hooks yet (§6.6 lists this for "initial local state") — `state.db` is a plain SQLite file on disk today, protected only by normal filesystem permissions.
- Output values, generated artifact hashes, and rollback snapshots are modeled (the shapes exist) but not yet meaningfully populated — nothing produces real values for them until the apply/compiler work in later phases.

## Security implications

- No raw resource values (and therefore no secrets) are ever written to `state.db` — see "What's stored" above.
- File locking is a coordination mechanism for well-behaved concurrent `agentform` processes on the same machine, not a security boundary — normal filesystem permissions are what actually restrict who can read/write `.agentform/`.
- See `docs/security/threat-model.md` for the full cross-package picture.

## Troubleshooting

- **`StateLockError` you didn't expect**: another `agentform` process (or one that crashed within the last `staleTimeoutMs`, default 10 minutes) holds `.agentform/lock`. Wait for it to finish, or — once the timeout passes — the next attempt takes over automatically.
- **`StateMigrationError` on `open()`**: a migration failed partway; the error message names which one. The database is left at whatever version successfully applied before the failure (each migration is its own transaction), not partially migrated.
- **`.agentform/state.db-wal` / `.agentform/state.db-shm` sitting around**: normal — SQLite's WAL-mode sidecar files. They're checkpointed into `state.db` before any backup and cleaned up when the database is closed cleanly.
