# ADR-0004: Parser architecture — one source format, one reference walk, no eval

## Status

Accepted

## Context

Phase 3 (`temp/instruction.md` §7, Phase 3 objectives) requires: parsing both YAML and JSON with preserved source locations; resolving `$ref`s, prompt files, and JSON Schema files across a multi-file project; a project-root filesystem sandbox (§19); and `${env.*}`/`${var.*}`/`${local.*}` interpolation via "a safe expression parser" that must not use `eval`. None of the spec's prose pins down the exact mechanics — how one parser handles two source formats, how three different "load another file and inline it" marker types interact when nested inside each other, or what "safe expression parser" concretely means for a grammar this small. Those are the decisions this ADR records.

## Decision

- **One parser for both YAML and JSON.** JSON is valid YAML (with minor edge cases that don't arise in Agentform specification files), so `loadDocument` always parses with the `yaml` package's `parseDocument`, regardless of file extension. This is also how source locations are obtained for JSON: the `yaml` package's CST (`LineCounter` + node `.range`) gives line/column for every field in either format, which a JSON-only parser (e.g. `JSON.parse`) cannot provide at all.
- **`$ref`, `file`, and `schemaRef` are resolved in a single recursive walk** (`refs.ts`), not three separate passes. All three are "single-key marker object → load and inline" patterns, and — critically — all three must resolve their path _relative to whichever file currently contains them_, not the project's entry file. Only a single walk that threads `currentFile` through recursion (the same way it already has to for `$ref` chains) gets this right; a separate post-hoc pass for `file`/`schemaRef` was tried first and produced exactly this bug (a `file:` reference nested inside a `$ref`-loaded file resolved against the wrong base directory and was incorrectly rejected as escaping the project root) — see `refs.test.ts`'s "resolves a file reference nested inside a $ref-loaded file relative to THAT file" test, which exists specifically to pin this down.
- **`$ref` recurses into the loaded content looking for further markers; `file` and `schemaRef` do not.** A `$ref` target is more Agentform document structure. A `file` target is plain prompt text. A `schemaRef` target is a JSON Schema document, which has its own `$ref` convention (JSON Schema's, not Agentform's) — recursing into it with Agentform's resolver would be a correctness bug, not a feature.
- **Auto-discovered resource files go through the same reference-resolution walk as `$ref` targets**, not a bare parse. An auto-discovered `agents/writer.yaml` can itself contain `instructions: { file: ../prompts/writer.md }`, and that has to resolve relative to `agents/`, exactly like the `$ref` case above.
- **A file already consumed by an explicit `$ref` is skipped by auto-discovery, silently — not flagged as a duplicate.** `resolveReferences` returns the set of relative file paths it read (`consumedFiles`); `discoverResourceCollection` skips any auto-discovered file in that set before checking for a genuine key collision. Without this, the spec's own canonical pattern (`$ref: ./agents/researcher.yaml`, which deliberately points into the very directory auto-discovery also scans) would always self-collide.
- **The interpolation grammar is `${(env|var|local)\.[A-Za-z_][A-Za-z0-9_]*}`, evaluated with a regular expression and a map lookup — nothing else.** No arithmetic, no nested expressions, no function calls, no `eval`/`Function()`/dynamic `import()` anywhere in the package. A whole-string interpolation preserves the resolved value's type (so `maxTokens: ${var.limit}` can satisfy a numeric schema field); an embedded interpolation always coerces to a string.
- **Locals cannot reference other locals.** `resolveLocals` explicitly rejects `${local.*}` inside a `locals:` block. This sidesteps needing dependency-ordering or cycle detection for a feature the spec only asks to compute one named value from `var`/`env` — a real requirement (locals referencing each other) can be added later without breaking this decision, since it would just relax an existing restriction rather than change resolved values that already work.
- **Every filesystem operation goes through an injected `FileSystem` interface** (`readFile`/`exists`/`listFiles`), never `node:fs` directly inside resolution logic. This is what makes every path-safety, cycle-detection, and multi-file-assembly behavior testable against an in-memory project tree (`createInMemoryFileSystem`) instead of real temp directories.

## Alternatives considered

- **Separate JSON parser (`JSON.parse`) for `.json` files**: rejected — loses source-location tracking entirely for JSON projects, and adds a second code path that has to agree with the YAML path on every edge case (duplicate keys, error formatting) instead of sharing one.
- **Resolve `file`/`schemaRef` as a pass separate from `$ref`**: tried, produced a real bug (see Decision above), rejected once the bug was understood.
- **A richer expression language for interpolation** (arithmetic, conditionals, function calls): rejected — the spec explicitly asks for a _safe_ expression parser, not a general one, and the three-namespace, dotted-identifier grammar is the smallest thing that satisfies every example in the build spec. A richer grammar can be added later as a genuinely new, additive capability; it isn't blocked by this decision.
- **Full dependency-ordered locals** (locals referencing other locals): deferred, not rejected — see Decision above.

## Consequences

- Any future marker type that follows the same "single-key object → load and inline" shape (there is no known one planned yet) should be added to the _same_ walk in `refs.ts`, not a new separate pass, to avoid reintroducing the `currentFile`-tracking bug this ADR documents.
- `resolveReferences`'s public result now includes `consumedFiles`; any future caller that resolves references directly (bypassing `loadProject`) and also wants auto-discovery duplicate-avoidance needs to thread that set through, the same way `discover.ts` does.
- The interpolation grammar's simplicity means some plausible future asks (arithmetic in a `when` expression, referencing a local from another local) are out of scope for this package as it stands — Phase 3's own scope stops at "safe expression parser" for `${...}` interpolation; the `when`/`condition`/`transform` workflow-node _expressions_ validated as non-empty strings by `@agentform/schema` (Phase 2) are a related but separate future expression-language decision, not this one.

## Security impact

This ADR is largely _about_ security decisions: the project-root sandbox (`@agentform/core`'s `resolvePathWithinRoot`/`resolvePathRelativeToFile`), reference-cycle and max-depth bounds against denial-of-service via recursive references (§19), and the hard "no eval" constraint on interpolation. See `docs/parser-reference.md`'s "Security implications" section for the user-facing summary.

## Migration impact

None — this is the initial parser implementation.
