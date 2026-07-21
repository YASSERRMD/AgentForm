# Release process

## Purpose

How Agentform's npm packages get versioned and published, what a release actually contains, and the safety design behind the automation — distinct from `docs/migration-guide.md`'s "how a specification's `apiVersion` evolves" (ADR-0003), which is a separate concern: a package version bump (`@agentform/cli` `0.1.0` → `0.2.0`) does not imply a spec version change, and vice versa.

## Versioning policy

Every published package (`@agentform/*`) is versioned independently via [Changesets](https://github.com/changesets/changesets), configured in `.changeset/config.json`. A pull request that changes a package's public behavior adds a changeset (`pnpm changeset add`) describing the change and its semver bump (patch/minor/major); `pnpm changeset version` later consumes all pending changesets, bumping each affected package's `package.json` version and writing its `CHANGELOG.md` entry. `updateInternalDependencies: patch` means a package that only depends on another `@agentform/*` package that changed gets a patch bump itself, keeping the workspace's internal `workspace:*` version ranges consistent without every change cascading as a major bump across unrelated packages.

`access: restricted` in `.changeset/config.json` means every `@agentform/*` package publishes as a private, restricted-access scoped package by default — publishing publicly on npm requires deliberately changing this, which is a decision left to whoever actually runs a real release, not one this automation makes silently.

Package versions and the specification's `apiVersion` (`agentform.dev/v1alpha1`, ADR-0003) move independently: a new minor/major CLI release can ship while every spec file still declares the same `apiVersion`, since most CLI changes (new commands, new adapter capabilities, bug fixes) don't change what a valid specification document looks like. A new `apiVersion` literal is a separate, much rarer decision — see `docs/migration-guide.md`.

## Reproducible builds

Every release is built from a fully pinned toolchain: an exact `packageManager` (`pnpm@10.22.0`, enforced by corepack), an exact TypeScript version (`6.0.3`, not a range), and a committed `pnpm-lock.yaml` that CI installs from with `--frozen-lockfile` — the same lockfile-exact-install discipline that closes the dependency-confusion gap described in `docs/security/threat-model.md`. Combined with `@agentform/compiler`'s existing determinism guarantee (every adapter's `generate()` produces byte-identical output for the same input IR, proven by each adapter's own test suite — see ADR-0009/ADR-0015 and the "Generated-code tampering" entry in the threat model), the same commit built twice produces the same published artifacts.

## Software bill of materials

`pnpm sbom` (`scripts/generate-sbom.mjs`) generates a CycloneDX-shaped `sbom.json` from pnpm's own resolved dependency graph (`pnpm list --recursive --json --depth Infinity --prod`) — every workspace package plus every production dependency, transitive included, each as a `pkg:npm/<name>@<version>` component. This is deliberately not a third-party SBOM generator: most assume an npm-style `package-lock.json`, which this pnpm workspace doesn't have, and pnpm's own `list --json` output already contains everything a CycloneDX component list needs. `sbom.json` is regenerated fresh for each release (gitignored, never committed — a checked-in SBOM would silently drift from the real dependency graph the moment any dependency changed) and attached to the corresponding GitHub Release.

## The release workflow

`.github/workflows/release.yml` is `workflow_dispatch`-only — it never runs on a push or a pull request, unlike `ci.yml`. This is a deliberate safety boundary: versioning and publishing real npm packages is a much higher-consequence action than running tests, so it requires a human to explicitly choose "Run workflow" in the GitHub Actions UI, and its `dry_run` input defaults to `true` — even a manual trigger only bumps versions locally and prints the diff unless someone deliberately sets `dry_run: false`. With `dry_run: false`, the workflow runs the same lint/typecheck/test/build gate CI does, applies pending changesets, commits the version bump, generates the SBOM, publishes to npm with provenance attestation (`NPM_CONFIG_PROVENANCE=true`, using the workflow's `id-token: write` permission — npm's documented environment-variable form of `npm publish --provenance`, since changesets' own `publish` command has no dedicated provenance flag), pushes the version commit and the git tags changesets creates per published package, and creates a GitHub Release per tag with `sbom.json` attached.

**This workflow has never been run in this repository, and publishing requires a real `NPM_TOKEN` secret that has not been configured.** It exists as verified, ready infrastructure — every command it runs (`pnpm changeset version`, `pnpm changeset publish`, `pnpm sbom`) has been exercised directly during development — not as evidence that a release has happened.

## Compatibility matrix

| Agentform CLI | Node.js | Supported `apiVersion`   |
| ------------- | ------- | ------------------------ |
| `0.1.x`       | `>=22`  | `agentform.dev/v1alpha1` |

This table gets a new row when a release changes either the minimum supported Node.js version or adds support for a new `apiVersion` — not on every release. See `docs/compiler-reference.md` for the separate framework-adapter compatibility matrix (which target frameworks support which workflow node/tool types), a different axis from this one.

## Upgrade instructions

Agentform has not had a release yet — `0.1.0` (once actually published) will be the first, so there is no upgrade path to document yet. Once a `0.2.0` (or later) release exists, this section is where its upgrade notes belong: what changed, what (if anything) requires a specification or generated-project change, and a link to the relevant package's `CHANGELOG.md`. See `docs/migration-guide.md` for the same honesty about `apiVersion` having no migration history yet either.
