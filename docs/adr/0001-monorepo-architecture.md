# ADR-0001: Monorepo architecture

## Status

Accepted

## Context

Agentform is designed as ~25 separately-versionable units: a CLI, and packages for the schema, parser, diagnostics, IR, planner, state engine, compiler, policy engine, evaluator, observability, plugin SDK, six framework adapters, two state backends, a secrets provider, test utilities, and a project scaffolder (see `README.md`'s repository layout). These packages have real dependency relationships (the compiler depends on the IR, adapters depend on the plugin SDK, and so on) that need to be enforced, not just documented. Coordinating schema/IR changes across dependent packages atomically, and keeping CI, linting, and formatting configuration consistent across ~25 packages, both favor a single repository over many.

## Decision

Use a single pnpm workspace monorepo (`pnpm-workspace.yaml` covering `apps/*` and `packages/*`), orchestrated by Turborepo (`turbo.json`) for cached, dependency-aware task execution (`build`, `typecheck`, `lint`, `test`). Shared tooling configuration (TypeScript base config, ESLint flat config, Prettier config) lives once at the repository root and is extended/inherited by each package rather than duplicated.

Cross-package imports must go through the package's public entry point (`@agentform/<name>`), never a relative path reaching into another package's `src/` or `dist/` — enforced by an ESLint `no-restricted-imports` rule. This keeps each package's public API the actual contract between packages, which matters once packages are compiled independently and potentially published independently later.

## Alternatives considered

- **Multiple repositories** (one per package or per adapter): rejected — would require publishing and version-bumping internal packages just to make a cross-package change, and would make atomic schema/IR changes across dependent packages impractical during a phase of active, coupled development.
- **A single package with internal modules** instead of separate `packages/*`: rejected — the spec requires each framework adapter and each state/secret backend to be independently distributable later (§7 "Extensibility": provider plugins, framework adapters, state backends), and a monorepo-of-packages gives that for free while a single package would require a later breaking split.
- **Nx instead of Turborepo**: both are reasonable; Turborepo was chosen for its smaller configuration surface and tighter fit with a pnpm-native workspace, which matches this project's "avoid unnecessary complexity" principle. This is a low-cost-to-reverse choice — Nx targets the same `package.json` script conventions and could be substituted later without restructuring packages.

## Consequences

- One `pnpm install`, one lockfile, one CI run covers the whole system — but that CI run must scale as packages grow; Turborepo's caching is what keeps it fast rather than linear in package count.
- All packages currently share one version lifecycle (`0.1.0`) and are `private: true`; independent versioning/publishing is deferred to the module registry work in Phase 12, at which point Changesets (already configured, see ADR-0001's sibling tooling) will drive per-package version bumps.
- The import-boundary ESLint rule is enforced today even though, in Phase 1, no package yet imports another — this is intentional: it fails fast the moment Phase 3+ starts wiring real cross-package dependencies (parser → core, compiler → ir, etc.) instead of only being noticed in review.

## Security impact

None directly. Keeping all source in one repository does mean a compromised contributor credential has write access to every package at once; this is mitigated by branch protection on `main` and required CI checks (Phase 1 CI), not by repository structure.

## Migration impact

None — this is the initial repository structure.
