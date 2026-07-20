# ADR-0002: TypeScript and Node.js runtime

## Status

Accepted

## Context

The spec (`temp/instruction.md` §5) mandates Node.js 22+, TypeScript 5.x, ESM modules, and strict TypeScript, "unless a clearly documented architectural reason requires an alternative." At implementation time, the npm registry's `latest` TypeScript is actually **7.0.2** — a new major that has moved past 6.x. Checking the ecosystem before pinning to registry-`latest` surfaced a real incompatibility: `typescript-eslint@8.64.0` (also registry-`latest`, and required for the strict linting this project depends on) declares a peer dependency of `"typescript": ">=4.8.4 <6.1.0"`. TypeScript 7.0.2 falls outside that range; TypeScript 6.0.3 (the newest 6.x release, immediately below the 6.1.0 ceiling) falls inside it.

## Decision

- **Node.js**: require `>=22.0.0` (`package.json#engines.node`), and run CI against Node 22 specifically (the floor, not whatever is newest) so the workspace never silently depends on a Node 23/24-only API.
- **TypeScript**: pin to `6.0.3` exactly (not a caret range) in the root `devDependencies`, rather than tracking registry-`latest`. This is the newest TypeScript release that `typescript-eslint@8.64.0`'s peer range actually supports. Revisit this pin only when `typescript-eslint` (or its eventual TS-7-compatible successor) publishes support for TypeScript 6.1+/7.x — bumping TypeScript without confirming that first would silently degrade type-aware linting.
- **Modules**: ESM only everywhere (`"type": "module"`), `module`/`moduleResolution: "NodeNext"` in `tsconfig.base.json`, no CommonJS output.
- **Compiler strictness**: `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters` in the shared base config every package extends.
- **No TypeScript project references (`composite`) yet**: Phase 1 packages have no real cross-package imports (each is an identity-only skeleton), so project references would be entirely inert. Each package instead builds independently via its own `tsc -p tsconfig.json`. This is reconsidered once Phase 3+ introduces real cross-package dependencies (e.g. `parser` depending on `core`), where project references would start providing real incremental-build value.

## Alternatives considered

- **Track TypeScript `latest` (7.0.2)**: rejected for now — would break `typescript-eslint`'s peer contract, which is exactly the kind of ecosystem-compatibility failure that's cheap to avoid up front and expensive to debug later (parser/type-aware-lint mismatches don't always fail loudly).
- **Pin an older, more conservative TypeScript 5.x**: unnecessary — 6.0.3 is inside `typescript-eslint`'s supported range and is the newest release with that property, so there's no compatibility reason to go older.
- **A bundler (tsup/unbuild) instead of plain `tsc`** for package builds: rejected for Phase 1 — nothing is being published or bundled for distribution yet, and plain `tsc` output (with declaration maps) is simpler and sufficient; revisit if/when a package needs single-file bundled output (e.g. `create-agentform`'s npm-create entry).

## Consequences

- CI and local dev both build against a slightly-older-than-registry-latest TypeScript; `pnpm install` will report "6.0.3 (7.0.2 is available)" as an informational note, not a warning to act on reflexively.
- Bumping TypeScript in the future requires re-checking `typescript-eslint`'s peer range first, not just running `pnpm update`.
- Every package currently builds independently (no shared incremental build graph via project references); build time scales linearly with package count today, which is acceptable at 24 skeleton packages but should be re-measured against the Phase 1 performance targets (§26) as real logic is added.

## Security impact

None. This ADR only affects build tooling versions, not runtime behavior of generated or executed code.

## Migration impact

None — this is the initial toolchain choice.
