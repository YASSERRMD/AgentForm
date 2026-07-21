# Agentform module registry

## Purpose

`@agentform/registry` resolves a project's `spec.modules` declarations against a registry of published `AgentformModule` documents, merging each module's resources into the project before schema validation runs. A module is a reusable, versioned, optionally-signed bundle of models/tools/agents/workflows/memory — the same idea as a Terraform module, scoped to agentic-system resources. `agentform lockfile` (Phase 12) is the current CLI consumer.

## Minimal example

Publish a module, then declare and resolve it:

```ts
import { publishModule, resolveProjectModules } from '@agentform/registry';

publishModule(registryRoot, 'internal/support-triage', {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgentformModule',
  metadata: { name: 'support-triage', version: '1.0.0' },
  spec: {
    inputs: { escalationEmail: { type: 'string' } },
    agents: {
      triage: { model: 'gpt', instructions: { text: 'Route to ${input.escalationEmail}' } },
    },
  },
});

const { value, diagnostics, resolvedModules } = resolveProjectModules(projectDocument, {
  registryRoot,
  trustedPublicKeyPem,
});
```

`value` is the project document with every resolved module's resources merged into `spec.agents`/`spec.tools`/etc.; `resolvedModules` is what `agentform lockfile` pins.

## Module documents

A module is its own top-level document kind, `moduleDefinitionSchema` (`packages/schema/src/module.ts`): `apiVersion: agentform.dev/v1alpha1`, `kind: AgentformModule`, `metadata` (name + `semverSchema`-checked `version`), and a `spec` with optional `inputs`, `outputs`, `models`, `tools`, `agents`, `workflows`, `memory`, `policies`, `evaluations` — the same resource schemas the top-level application document uses, so a module's `agents.triage` is validated by the exact same `agentSchema` an inline `spec.agents.triage` would be. There are no separate `prompts:`/`schemas:` collections — a prompt is an agent's `instructions`, a schema is a tool's `inputSchema`/`outputSchema`, both already inside the collections a module already carries.

A project references a module via `spec.modules.<id>: { source, version, inputs? }` (`moduleReferenceSchema`). Schema validation only checks the reference is well-formed; resolving `source`+`version` against an actual registry is `@agentform/registry`'s job, run before schema validation (see below).

## The local registry

`publishModule(registryRoot, source, definition, options?)` writes two files under `<registryRoot>/<source>/<version>/`: `module.yaml` (the definition, as YAML) and `manifest.json` (`source`, `version`, a `contentHash` computed by `@agentform/ir`'s `computeContentHash`, `publishedAt`, and — if `options.privateKeyPem` is given — an Ed25519 `signature` over the content hash plus the matching `publicKeyPem`). `source` can itself contain `/` (e.g. `registry.agentform.dev/government/complaint-intake`), which becomes nested directories; `moduleDir()` sandboxes this through `@agentform/core`'s `resolvePathWithinRoot`, the same path-traversal guard used everywhere else in this codebase a file reference comes from data rather than a trusted caller. Re-publishing the same `source`+`version` overwrites — the local registry is a workspace a publisher controls directly, not an append-only store.

`resolveModule(registryRoot, source, version, trustedPublicKeyPem?)` reads both files back, recomputes the content hash over the on-disk `module.yaml`, and throws if it no longer matches `manifest.json`'s recorded hash (tamper detection — the same "recompute and compare" pattern `.afplan` files and `agentform test`'s result files use elsewhere), or if the definition fails `moduleDefinitionSchema` validation. It never returns a partially-valid result. `listModules(registryRoot)` walks the tree for every published `source`+`version` pair, returning `[]` if the root doesn't exist yet.

`@agentform/registry` also has a parallel plugin registry (`publishPluginEntry`/`resolvePluginEntry`/`listPlugins`, `src/plugin-registry.ts`) for publishing plugin package metadata (name, version, content hash, optional signature) — distinct from module resources, used once a `FrameworkAdapter`/`StateBackend` package (see `docs/plugin-development.md`) is ready to be discovered by others on the same machine.

## Signing

`generateSigningKeyPair()`, `signContentHash(hash, privateKeyPem)`, and `verifyContentHashSignature(hash, signature, publicKeyPem)` (`src/signing.ts`) wrap Node's built-in `node:crypto` Ed25519 support — no external dependency for something this codebase already gets from the runtime. Signing is over the module's `contentHash`, not the raw YAML, so verification is a single fast comparison rather than re-hashing a potentially large document. `verifyContentHashSignature` never throws — a malformed signature or key returns `false`, matching this codebase's general "invalid input is absence, not a crash" discipline for verification functions.

Trusting a key is a per-machine decision the CLI never defaults: `AGENTFORM_REGISTRY_TRUSTED_KEY` (read by `apps/cli/src/lib/registry.ts`'s `trustedRegistryPublicKeyPem()`) must be set explicitly, or no signature checking happens at all. When it is set, `resolveProjectModules` treats an unsigned module as a warning (its provenance can't be verified, but it isn't rejected) and a signed-but-invalid module as an error (`AGF7006`, `MODULE_SIGNATURE_UNVERIFIED`) — see ADR-0014 for why unsigned isn't itself an error.

## Input substitution

`substituteInputs(value, inputs)` (`src/input-substitution.ts`) is a small, self-contained `${input.NAME}` string interpolator, deliberately separate from `@agentform/parser`'s `${env.*}`/`${var.*}`/`${local.*}` interpolation — reusing that interpolator's fixed, already-well-tested variable namespaces would have meant either extending it with a module-specific case it has no other reason to know about, or risking its existing behavior for every non-module project. A whole-string match (`"${input.escalationEmail}"`) preserves the input's original type (a `boolean`/`number`/`object` input stays that type); an embedded match (`"contact: ${input.escalationEmail}"`) coerces to string. A reference to an input with no supplied value and no `default` is reported in the result's `missing` array rather than throwing, so the caller (`resolveProjectModules`) can turn it into a proper diagnostic with the right resource path attached.

## Resolving modules into a project

`resolveProjectModules(value, { registryRoot, trustedPublicKeyPem? })` is the merge step. For each `spec.modules` entry, in declaration order: resolve it from the registry (catching not-found/tampered/invalid-schema and mapping each to its own diagnostic code below), check its signature, resolve its declared inputs against what the project supplied (falling back to each input's `default`, erroring on `AGF7004` when neither exists), substitute `${input.*}` through every resource the module declares, then merge those resources into an accumulator alongside the project's own inline resources.

The merge is collision-checked per identifier: if a module declares an `agents.triage` that already exists in the accumulator — whether hand-authored in the project or contributed by an earlier module — the existing declaration wins and `AGF7005` (`MODULE_RESOURCE_COLLISION`) is reported. This is the same "explicit, or earlier, wins" precedent `@agentform/parser`'s auto-discovery already established for file-discovered resources; a module is never allowed to silently overwrite something already there. A module that fails to resolve at all is skipped entirely (no partial merge) — its diagnostics are still reported.

This runs in `apps/cli/src/lib/pipeline.ts`'s `loadAndBuildIR`, between `loadProject` (parsing, `$ref`/overlay/variable resolution) and `buildIR` — **before** schema validation, not after. Placing it before validation means a module's contributed `agents.triage` is checked by the exact same `agentSchema` validation, `AF0xx` policy engine, and IR semantic checks any inline resource is — there is no separate, weaker validation path for module-sourced resources.

## Diagnostic codes

`@agentform/registry` owns the `AGF7xxx` range (`packages/registry/src/codes.ts`) — parser is `1xxx`, schema `2xxx`, ir `3xxx`, policy `4xxx`, compiler `5xxx`, evaluator `6xxx`, registry `7xxx`:

| Code      | Meaning                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGF7001` | `MODULE_NOT_FOUND` — the declared `source`+`version` isn't published.                                                                                                        |
| `AGF7002` | `MODULE_INTEGRITY_FAILURE` — the on-disk module's content hash no longer matches its manifest.                                                                               |
| `AGF7003` | `MODULE_SCHEMA_INVALID` — the resolved module definition fails `moduleDefinitionSchema`.                                                                                     |
| `AGF7004` | `MODULE_MISSING_REQUIRED_INPUT` — an input with no default wasn't supplied.                                                                                                  |
| `AGF7005` | `MODULE_RESOURCE_COLLISION` — a module resource's identifier already exists; the existing one wins.                                                                          |
| `AGF7006` | `MODULE_SIGNATURE_UNVERIFIED` — a signature is present but doesn't verify against the configured trusted key (error), or absent while a trusted key is configured (warning). |

## Lockfile

`buildLockfile(resolvedModules)` (`src/lockfile.ts`) turns `resolveProjectModules`'s `resolvedModules` summaries into a `Lockfile` (`lockfileVersion: 1`, `generatedAt`, and each module's `id`/`source`/`version`/`contentHash`/`signatureVerified`, sorted by `id`). `serializeLockfile`/`parseLockfile` round-trip it as pretty-printed JSON; `parseLockfile` returns `undefined` (never throws) for malformed JSON or an unrecognized `lockfileVersion`.

`agentform lockfile [--environment <name>] [--check]` (`apps/cli/src/commands/lockfile.ts`) is the CLI entry point: it runs the full `loadAndBuildIR` pipeline (so module resolution and its diagnostics happen for real), then either writes `agentform.lock` to the project root, or — with `--check` — compares the freshly-resolved lockfile against what's already on disk without writing, exiting `GENERAL_FAILURE` (1) if they differ (module-set changed, or a locked module's `source`/`version`/`contentHash` no longer matches). A module-resolution error (any `AGF7xxx` diagnostic at `error` severity) exits `SEMANTIC_VALIDATION_FAILURE` before a lockfile is ever written.

`agentform.lock` pins exactly which content hash each declared module resolved to at lock time — the same drift signal a `.afplan`'s own content hash provides for plans, applied to the registry instead of tracked state. As of Phase 12, `agentform validate`/`apply` do not yet cross-check `agentform.lock` against a fresh resolution automatically; `agentform lockfile --check` is a separate, explicit step (suited to a CI gate) rather than an implicit one.

## Registry location

`registryRootFor()` (`apps/cli/src/lib/registry.ts`) defaults to `~/.agentform/registry` — a per-machine shared cache, the same convention npm/pnpm use for their own package caches, since a published module is meant to be reused across projects on one machine rather than re-published per consumer. `AGENTFORM_REGISTRY_ROOT` overrides it (used by this package's own tests, and available for a machine-wide registry mounted somewhere else).

## Scope

- **No remote/HTTP registry.** Everything above is a local filesystem registry (`~/.agentform/registry` or an override path) — there is no `agentform module publish` command reaching a network service, and no registry server implementation. A team sharing modules today does so by sharing a filesystem location (a mounted volume, a synced directory) that all machines point `AGENTFORM_REGISTRY_ROOT` at.
- **No version resolution beyond an exact match.** `spec.modules.<id>.version` must be an exact `semverSchema`-valid version already published; there is no `^1.0.0`-style range resolution the way npm/pnpm dependencies get.
- **Module-vs-module dependencies aren't supported.** A module's own `spec` cannot declare `modules:` — resolution is one level deep by design; nesting would require cycle detection this package doesn't implement.

## Security implications

- Module resolution happens before schema/policy validation, but a resolved module's resources are still subject to every policy check (`AF001`-`AF015`) an inline resource would be — a module cannot bypass policy enforcement by construction.
- Signature verification is opt-in per machine (`AGENTFORM_REGISTRY_TRUSTED_KEY`); with no trusted key configured, modules are trusted by presence in the registry alone (the same trust level as any other file on disk the project references). See `docs/security/threat-model.md` for the full registry trust boundary.
- `resolvePathWithinRoot` in `moduleDir()` prevents a `source` value (which can contain `/`) from writing or reading outside `registryRoot`.

## Troubleshooting

- **`agentform lockfile` reports `AGF7001` for a module you just published**: check `AGENTFORM_REGISTRY_ROOT` is the same value (or the same default `~/.agentform/registry`) the publish step used — a mismatch is by far the most common cause, not a real missing module.
- **`AGF7002` after copying a registry directory between machines**: something in the copy altered `module.yaml`'s bytes (line-ending conversion is a common culprit) so its recomputed content hash no longer matches `manifest.json`. Re-publish from the original source rather than editing either file by hand.
- **A module's resource silently doesn't appear in the project**: check for `AGF7005` — an identically-named resource already exists (inline, or from an earlier-declared module) and won, per the "existing wins" collision rule.
- **`agentform lockfile --check` fails right after running `agentform lockfile` with no other changes**: the registry itself changed between the two runs (a module was re-published with different content at the same version) — `--check` is comparing against a fresh resolution each time, not against what was true when the lockfile was written.
