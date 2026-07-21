# Agentform plugin development

## Purpose

§11 of the build specification defines eight kinds of plugin Agentform can eventually be extended with. `docs/adapter-guide.md` covers one of them — `FrameworkAdapter` — in full depth, because it's the one with the most existing implementations to learn from (six of them, `docs/compiler-reference.md`). This document is the wider picture: the manifest shape every plugin type shares regardless of kind, which of the eight actually have a real TypeScript interface to implement as of this build, and how a finished plugin gets published and discovered through `@agentform/registry`. The central honest fact this document exists to state plainly: **only two of the eight plugin types have a real interface today.** The other six are real, stable names — not placeholders that might be renamed — but nothing in this codebase defines what implementing one of them actually looks like yet.

## `PluginType` and the manifest every plugin shares

`packages/plugin-sdk/src/manifest.ts` defines the complete, closed set:

```ts
export type PluginType =
  | 'FrameworkAdapter'
  | 'StateBackend'
  | 'SecretProvider'
  | 'PolicyProvider'
  | 'EvaluationProvider'
  | 'DeploymentProvider'
  | 'ModelProvider'
  | 'ToolProvider';
```

and the manifest shape every plugin, regardless of `type`, exposes:

```ts
export interface AgentformPluginManifest {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly type: PluginType;
  readonly capabilities: readonly string[];
  readonly supportedSpecVersions: readonly string[];
}
```

`name` is the plugin's real package name (`@agentform/adapter-openai`, or `@your-scope/agentform-adapter-custom` for a third-party one); `version` is that package's own semver; `apiVersion` names the Agentform plugin API shape the manifest itself conforms to (every plugin in this codebase today declares `'agentform.dev/v1alpha1'`); `capabilities` is a free-form list of what the plugin can do, meaningful only within its own `type` (an adapter's capabilities and a state backend's capabilities aren't drawn from the same vocabulary); `supportedSpecVersions` names which Agentform specification version(s) (`docs/schema-reference.md`) the plugin understands.

The source comment directly on `PluginType` is worth quoting exactly, since it's the most precise statement of scope for this entire document:

> The 8 plugin types §11 defines. Only `FrameworkAdapter` has a fleshed-out interface as of Phase 8 — the other 7 are named here (so `PluginType` is already the complete, stable enum a future phase's plugin can declare against) but have no corresponding TypeScript interface yet; inventing one before a phase actually consumes it risks guessing a shape that doesn't match what that phase turns out to need.

That comment predates this build's state-engine work: `StateBackend` has since gained a real interface of its own too — defined in `@agentform/state`, a separate package from `@agentform/plugin-sdk`, not as an amendment to the comment above. The next two sections cover exactly these two real plugin types; the section after covers the other six honestly, as reserved names with no interface to implement.

## `FrameworkAdapter` — implemented

Covered in full in `docs/adapter-guide.md`: the `manifest`/`validateCompatibility`/`generate` contract every one of the six existing adapters implements, the optional `inspectExisting`/`deploy`/`destroy` hooks, `CompatibilityReport`/`GeneratedProject`'s exact shapes, and how a new adapter is registered into `agentform compile`/`agentform apply` via `ADAPTER_REGISTRY`. This document won't repeat that material — start there if a framework adapter is what you're building.

## `StateBackend` — implemented

Unlike `FrameworkAdapter`, `StateBackend`'s interface is not defined in `@agentform/plugin-sdk` at all — it lives in `@agentform/state` (`packages/state/src/backend.ts`), the package that also defines the data shapes it stores (`docs/state-reference.md`). Its own doc comment states its purpose directly: "The plugin interface every state backend implements (§11's `StateBackend` plugin type)." Every method is `async`, deliberately, even though `@agentform/state-local`'s SQLite implementation happens to be synchronous under the hood (`node:sqlite`'s `DatabaseSync`) — so that a remote backend is a drop-in implementation, never a breaking redesign:

```ts
export interface StateBackend {
  readonly kind: string;

  open(): Promise<void>;
  close(): Promise<void>;

  migrate(): Promise<MigrationResult>;
  getSchemaVersion(): Promise<number>;

  acquireLock(options?: LockOptions): Promise<void>;
  releaseLock(): Promise<void>;
  withLock<T>(fn: () => Promise<T> | T, options?: LockOptions): Promise<T>;

  withTransaction<T>(fn: () => Promise<T> | T): Promise<T>;

  getApplicationState(): Promise<ApplicationState | undefined>;
  putApplicationState(state: ApplicationState): Promise<void>;

  listResourceStates(): Promise<readonly ResourceState[]>;
  getResourceState(address: string): Promise<ResourceState | undefined>;
  putResourceState(state: ResourceState): Promise<void>;
  deleteResourceState(address: string): Promise<void>;

  recordApplyStart(entry: Omit<ApplyHistoryEntry, 'status'>): Promise<void>;
  recordApplyFinish(id: string, status: ApplyOperationStatus, summary?: string): Promise<void>;
  listApplyHistory(limit?: number): Promise<readonly ApplyHistoryEntry[]>;

  recordDriftStatus(status: DriftStatus, checkedAt: string): Promise<void>;

  createBackup(): Promise<string>;
  listBackups(): Promise<readonly BackupInfo[]>;
  restoreBackup(backupId: string): Promise<void>;
  readBackupSnapshot(backupId: string): Promise<StateSnapshot>;
}
```

`kind` is a short, stable identifier surfaced directly by `agentform status` (its "State backend:" line) — `SqliteStateBackend` (`@agentform/state-local`) declares `readonly kind = 'sqlite'`. There are two real implementations in this codebase today, not one: `@agentform/state-local`'s `SqliteStateBackend` and `@agentform/state-postgres`'s `PostgresStateBackend` (`kind = 'postgres'`), a remote counterpart implementing the exact same interface so that `apps/cli` can select either without any command needing to know which one it's talking to. `withTransaction` is the method every mutating command leans on hardest — `agentform apply`'s final persistence step (every changed `ResourceState`, the new `ApplicationState`, and the finished apply-history record) runs inside one call to it, which is what makes "apply cannot partially corrupt state" true structurally rather than by convention (ADR-0012). `restoreBackup` is explicitly the disaster-recovery primitive, not what `agentform rollback` uses — rollback reads a snapshot via `readBackupSnapshot` and applies just its resource/application state through a normal transaction instead, specifically so it never erases apply history the way a full `restoreBackup` would (ADR-0013).

A new `StateBackend` implementation follows the same shape `PostgresStateBackend`'s own doc comment describes: "every method mirrors `SqliteStateBackend`'s own" — read both real implementations side by side (`packages/state-local/src/sqlite-state-backend.ts`, `packages/state-postgres/src/postgres-state-backend.ts`) rather than the interface alone, since the interface's doc comments describe _what_ each method must guarantee (atomicity, throwing on a missing backup, leaving other fields untouched on a narrow update) more precisely than the type signatures alone can.

Unlike `FrameworkAdapter`, there is no `ADAPTER_REGISTRY`-style lookup table keyed by a CLI flag for state backends — `apps/cli/src/lib/state.ts`'s `openStateBackend(rootDir)` is the one place a backend gets constructed, and it chooses between the two real implementations with a single environment variable: `AGENTFORM_STATE_POSTGRES_URL` unset (the default, matching every phase before Postgres support existed) opens `SqliteStateBackend` against `.agentform/` under the project root; setting it opens `PostgresStateBackend` against that connection string instead (`AGENTFORM_STATE_POSTGRES_SCHEMA` optionally overrides the Postgres schema name, default `"agentform"`, letting multiple projects share one database without colliding). There is deliberately no `spec`-level schema field for this — `openStateBackend`'s own doc comment explains why: `spec.deployment` is about deployment _targets_, not state _storage_, and an environment variable is the smallest real integration point without inventing schema surface a later phase would need to redesign. A third `StateBackend` implementation would need the same treatment here — `openStateBackend` extended to recognize whatever configuration selects it — to be reachable from the CLI at all.

## The other six plugin types — reserved, not implemented

`SecretProvider`, `PolicyProvider`, `EvaluationProvider`, `DeploymentProvider`, `ModelProvider`, and `ToolProvider` exist today only as string literals in the `PluginType` union above. There is no TypeScript interface for any of them anywhere in this codebase — no method signatures to implement, no base class to extend, nothing to import from `@agentform/plugin-sdk` for any of the six. This is a deliberate gap, not an oversight: inventing an interface for, say, `PolicyProvider` before a phase actually builds something that consumes one risks guessing a shape wrong and having to make a breaking change later, exactly the risk the `PluginType` doc comment calls out. What each name plausibly maps to, going only by what already exists elsewhere in this codebase under a different, non-plugin mechanism (not a promise about a future interface's actual shape):

- **`PolicyProvider`** — `@agentform/policy` today has a fixed, non-extensible built-in catalog (`BUILTIN_POLICIES`, `docs/policy-reference.md`); `docs/policy-development.md` covers how a new policy is added to that fixed catalog directly in-source, which is a different thing from a `PolicyProvider` plugin (an installable, external policy source) that doesn't exist yet.
- **`SecretProvider`** — `packages/secrets-env` exists in the workspace today as a minimal, buildable skeleton package, not a `SecretProvider` implementation.
- **`ModelProvider`/`ToolProvider`/`EvaluationProvider`/`DeploymentProvider`** — no corresponding package or mechanism exists yet at all, under any name.

If you're building something in one of these six categories, there is nothing to conform to yet — implementing `AgentformPluginManifest` with the right `type` gets you a validly-_shaped_ manifest, but there is no runtime code anywhere in Agentform that knows what to do with a `SecretProvider` or a `ModelProvider` once it has one.

## Publishing and discovering a plugin: `@agentform/registry`

`@agentform/registry`'s plugin registry (`packages/registry/src/plugin-registry.ts`) is metadata-only, deliberately: a plugin has no separate "module.yaml" body the way an `@agentform/registry` _module_ does (`docs/cli-reference.md`'s `agentform lockfile` command, `agentform.lock`) — a plugin's actual code is an installed npm package, so this registry only ever indexes and optionally signs the plugin's `AgentformPluginManifest`, never the plugin's code itself.

```ts
export function publishPluginEntry(
  registryRoot: string,
  manifest: AgentformPluginManifest,
  options: PublishPluginOptions = {}, // { privateKeyPem?, publicKeyPem? }
): PluginRegistryEntry; // { manifest, contentHash, publishedAt, signature?, publicKeyPem? }

export function resolvePluginEntry(
  registryRoot: string,
  name: string,
  version: string,
  trustedPublicKeyPem?: string,
): ResolvedPluginEntry; // { entry, signatureVerified: boolean }

export function listPlugins(registryRoot: string): readonly RegistryPluginSummary[]; // { name, version }[]
```

`publishPluginEntry` writes `plugins/<name>/<version>/plugin.json` under `registryRoot`, alongside a `contentHash` computed the same way `@agentform/ir`'s `computeContentHash` hashes anything else in this codebase; `resolvePluginEntry` recomputes that hash on read and throws if it doesn't match — the same tamper-evidence discipline `.afplan` plan files and `.agentform/test-results.json` use (`docs/security/threat-model.md`). Signing is optional: pass `privateKeyPem`/`publicKeyPem` to `publishPluginEntry` and a caller with the matching public key can verify `resolvePluginEntry`'s `signatureVerified` came back `true`, using the same `generateSigningKeyPair`/`signContentHash`/`verifyContentHashSignature` primitives the module registry uses. A minimal round-trip, adapted directly from `packages/registry/src/plugin-registry.test.ts`:

```ts
import { generateSigningKeyPair } from '@agentform/registry';
import { publishPluginEntry, resolvePluginEntry, listPlugins } from '@agentform/registry';

const manifest: AgentformPluginManifest = {
  name: '@example/agentform-adapter-custom',
  version: '1.0.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: ['agent', 'tool'],
  supportedSpecVersions: ['v1alpha1'],
};

const keys = generateSigningKeyPair();
publishPluginEntry(registryRoot, manifest, {
  privateKeyPem: keys.privateKeyPem,
  publicKeyPem: keys.publicKeyPem,
});

const resolved = resolvePluginEntry(
  registryRoot,
  manifest.name,
  manifest.version,
  keys.publicKeyPem,
);
resolved.signatureVerified; // true

listPlugins(registryRoot); // [{ name: '@example/agentform-adapter-custom', version: '1.0.0' }]
```

**No `agentform` CLI command surfaces any of this yet.** Compare the module registry, which every pipeline command already resolves against via the shared `loadAndBuildIR` helper's `resolveProjectModules` call (`apps/cli/src/lib/pipeline.ts`), and which `agentform lockfile` can additionally pin to a committed `agentform.lock` file — `publishPluginEntry`/`resolvePluginEntry`/`listPlugins` have no equivalent CLI-level caller anywhere: no `agentform plugin publish`/`agentform plugin list` command, and nothing resolves a `FrameworkAdapter` or `StateBackend` through this registry at all today. Registering a `FrameworkAdapter` so `agentform compile`/`agentform apply` can actually select it is a separate, more direct mechanism entirely: `docs/adapter-guide.md`'s `ADAPTER_REGISTRY`. Treat `@agentform/registry`'s plugin registry today as a metadata index a plugin author or a future CLI feature can build on, not yet as a distribution mechanism `agentform` itself consumes.

## Scope

- **Two of eight plugin types have a real interface**: `FrameworkAdapter` (`@agentform/plugin-sdk`) and `StateBackend` (`@agentform/state`). The other six — `SecretProvider`, `PolicyProvider`, `EvaluationProvider`, `DeploymentProvider`, `ModelProvider`, `ToolProvider` — are reserved names only.
- **No dynamic plugin loading exists for any plugin type.** A `FrameworkAdapter` is wired in at the TypeScript source level (`ADAPTER_REGISTRY`); a `StateBackend` is selected the same way by whatever code constructs one for the CLI to use. Nothing in Agentform today `require()`s or dynamically `import()`s a plugin package by name at run time.
- **The plugin registry is metadata-only.** It indexes and optionally signs a manifest; it never stores, loads, or executes a plugin's actual code.
- **No CLI-level publish/discover workflow exists yet** for plugins, unlike modules (`agentform.lock`) — see Publishing and discovering a plugin, above.

## Security implications

- `@agentform/plugin-sdk` has no runtime plugin-loading mechanism as of this build (`docs/security/threat-model.md`'s "Compromised plugins" entry) — every real plugin in this codebase (all six framework adapters, the two state backends) is a normal workspace dependency, compiled and shipped as part of `agentform` itself, not something installed and loaded from an arbitrary, untrusted source at run time.
- `resolvePluginEntry`'s content-hash check means a plugin registry entry that's been tampered with on disk is detected on read (a thrown error), not silently trusted — the same tamper-evidence guarantee `docs/adapter-guide.md`'s generated-artifact manifests and `docs/planner-reference.md`'s `.afplan` files provide for their own concerns. Signature verification is optional and additive on top of that — `resolvePluginEntry` never requires a `trustedPublicKeyPem` to succeed, only to report `signatureVerified: true`.
- A `StateBackend` implementation sits in a uniquely trusted position: `withTransaction`/`createBackup`/`restoreBackup` are the exact mechanisms every atomicity and rollback guarantee in `docs/state-reference.md` and ADR-0012/ADR-0013 depends on. A new implementation that gets any of these wrong (a transaction that isn't actually atomic, a backup that doesn't actually restore) silently breaks guarantees several other commands (`apply`/`rollback`/`destroy`) depend on without any structural check catching it — there is no automated cross-backend conformance test today beyond each backend's own test suite mirroring `SqliteStateBackend`'s.

## Troubleshooting

- **I want to add a custom policy source / secret manager / model provider as a plugin**: there is no interface for `PolicyProvider`/`SecretProvider`/`ModelProvider` to implement yet — see The other six plugin types, above. For policies specifically, see `docs/policy-development.md` for how to add one directly to the fixed built-in catalog instead, which is the only real extension point that exists today.
- **My `FrameworkAdapter`/`StateBackend` implementation compiles but nothing in `agentform` uses it**: implementing the interface alone doesn't register it — see `docs/adapter-guide.md`'s `ADAPTER_REGISTRY` section for adapters; for a state backend, check `apps/cli/src/lib/state.ts`'s `openStateBackend`, the one place a backend is actually constructed (see `StateBackend` — implemented, above, for how it currently chooses between the two real implementations).
- **`resolvePluginEntry` throws "failed integrity check"**: the registry entry's `plugin.json` was modified after `publishPluginEntry` wrote it, or copied incorrectly — recompute by publishing again from the real manifest rather than hand-editing the file.
- **`resolvePluginEntry`'s `signatureVerified` is `false` even though I signed the manifest**: check the `trustedPublicKeyPem` passed to `resolvePluginEntry` is the exact public key paired with the `privateKeyPem` passed to `publishPluginEntry` — a mismatched or omitted key resolves successfully (the content-hash check alone doesn't require a key) but reports `signatureVerified: false` rather than throwing.
