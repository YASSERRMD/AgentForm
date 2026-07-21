# Migration guide

## Purpose

"Migration" means two different things for Agentform, and this page covers both. The first is version-to-version migration of the specification format itself — what happens when `v1alpha1` eventually changes. That has no history yet: `v0.1.0` is Agentform's first prepared release, nothing has shipped before it, and no `v1beta1` or `v1` exists. This section documents the versioning _policy_ already established (ADR-0003), so a future change has a contract to follow rather than one invented after the fact. The second is migrating an existing project written directly against a framework (OpenAI Agents SDK or LangGraph) into an Agentform specification, which is a real, working workflow today via `agentform import`. Do not expect a v0.x-to-v1.x upgrade path in this document — it does not exist yet, and this page will not pretend otherwise.

## Three different version numbers

Before talking about migration, it's worth being precise about which "version" is under discussion, because Agentform has three independent ones:

- **`apiVersion: agentform.dev/v1alpha1`** — the specification _format_ version, declared at the top of every `agentform.yaml`. This is what the rest of this page is about.
- **The Agentform tooling's own package version** (`0.1.0` across the monorepo's `package.json` files) — the version of the CLI and packages implementing the format, currently pre-1.0 as the first release is prepared.
- **`metadata.version`** — a semver string every specification's own author sets on their _application_ (e.g. `1.0.0` in the starter templates). This has nothing to do with either of the above; it's the user's own versioning of the thing they're building.

A change to the tooling's package version or a change to your own `metadata.version` never implies anything about `apiVersion` compatibility, and vice versa.

## The `v1alpha1` versioning policy

`apiVersion` is a fixed Zod literal (`z.literal('agentform.dev/v1alpha1')` in `packages/schema/src/application.ts`), not a semver range or an open string. A document declaring any other `apiVersion` value fails validation immediately with a single, unambiguous diagnostic rather than being coerced or partially accepted. This was a deliberate choice over a range-checked string (accepting any `1.x`, for instance): Agentform hasn't shipped a version yet, so there is no real compatibility range to define, and a literal is the honest representation of "there is exactly one schema version today" (ADR-0003).

That literal is also what makes the forward policy concrete. Every schema object in `v1alpha1` is closed (`.strict()`) — an unrecognized key is a validation error (`AGF2006`), never a silently-ignored field. Combined with the fixed `apiVersion` literal, this means every future change to the specification format falls into exactly one of two categories, with no third option where `v1alpha1`'s meaning quietly shifts underneath an existing document:

- **Additive and non-breaking, staying within `v1alpha1`**: a new optional field on an existing resource, a new optional top-level section, a new enum value that's additive rather than replacing an existing one. A document written before the addition keeps validating exactly as it did.
- **Breaking, requiring a new `apiVersion` literal and a new schema module**: renaming or removing a field, changing what an existing field means, tightening a previously-open shape, or anything else that would make a currently-valid document either invalid or (worse) silently reinterpreted. This means introducing `v1beta1` or `v1` as a genuinely separate schema module alongside the existing `v1alpha1` one — not mutating `v1alpha1` in place. A document that declares `apiVersion: agentform.dev/v1alpha1` keeps validating against that exact schema indefinitely; moving to a newer format is an explicit, visible change to the document's own `apiVersion` field, never an implicit reinterpretation.

Neither of these has happened yet — there is only `v1alpha1`. When a second `apiVersion` does get introduced, expect it to arrive as a new schema module (parallel to, not replacing, `packages/schema/src/application.ts`'s current one) with its own ADR, and expect existing `v1alpha1` documents to keep validating unchanged.

## Migrating an existing project into Agentform

If you have a working project built directly against OpenAI Agents SDK or LangGraph and want an Agentform specification for it instead of writing one from scratch, `agentform import` is the supported starting point — not a from-scratch rewrite.

```bash
pnpm agentform --cwd path/to/existing-project import
```

`import` inspects `[sourceDir]` (defaulting to `--cwd`) and tries three recognizers in order, stopping at the first one that actually finds something usable: a previously **generated Agentform project** (reading its `manifest.json` and each file's own `// Source: <address>` comments to recover resource identity at full confidence), a **raw OpenAI Agents SDK project** (regex-based scanning for `Agent(...)`/`tool(...)` call sites and `@function_tool` decorators — literal string arguments only), or a **raw LangGraph project** (scanning for `StateGraph`/`add_node`/`add_edge`/`set_entry_point`, defaulting every recovered node to type `agent` rather than guessing its real type). If none of the three recognize anything usable in `[sourceDir]`, the command exits 14 and names what it currently supports — a different framework, or source code that doesn't match closely enough, is an honest scope limit, not a bug to work around.

A successful run writes a candidate specification — `agentform.import.yaml` by default, or wherever `--out <file>` points — and refuses to overwrite an existing file at that path. It never writes directly to `agentform.yaml`: a heuristically-recovered candidate should never silently become a project's real entry file. Alongside the file, it prints (and, with `--json`, structures) four things worth reading in full before doing anything else:

- **Which recognizer matched** and a **confidence score** — heuristic, not exact. Only the generated-Agentform recognizer's resource-_identity_ recovery is ever reported at a full `1.0`, and even then only identity, never field values.
- **Recovered resources**, grouped by kind (how many agents, tools, and so on were found).
- **`unsupportedConstructs`** — things the recognizer detected in the source but could not translate into any Agentform field.
- **`manualActions`** — concrete follow-up work the recognizer knows is needed (tool handlers, workflow wiring, and model provider verification are the most common).

The practical loop from here is: open the candidate file, work through `unsupportedConstructs`/`manualActions` one at a time, filling in or correcting whatever `import` couldn't recover on its own, then run `agentform validate` against it. Expect this to fail the first few times for anything beyond the simplest project — `import` never claims the candidate is valid, only that it's a reviewed starting point (`docs/cli-reference.md`'s own `agentform import` section is explicit about this). Once it validates cleanly, treat it as you would any other Agentform project: `agentform plan` and `agentform apply` to bring it under tracked state, or rename it to `agentform.yaml` first if you're satisfied it's ready.

This is a one-way trip in one direction only: `import` reads an existing project and produces a specification. It has no relationship to `agentform compile`, which does the opposite — reading a validated specification and generating a real project for any of the six target frameworks. Importing a LangGraph project does not require compiling back to LangGraph; once the specification exists, it can target any framework `agentform compile`/`agentform apply` support.

## What's not supported yet

`agentform import`'s recognizers currently cover only two source frameworks (OpenAI Agents SDK and LangGraph) plus previously-generated Agentform projects. A project written directly against Microsoft Agent Framework, Google ADK, AutoGen, or CrewAI has no recognizer yet, even though `agentform compile` can already _generate_ projects for all six targets — recognizing hand-written source in the other four is simply not built yet, not a deliberate exclusion. There is also no automated migration for a project's deployed state (`.agentform/state.db`) itself, since `import` produces a specification only; running `agentform apply` afterward creates fresh tracked state for whatever the imported specification now describes, rather than inheriting any history the original project might have had outside Agentform.

## See also

`docs/cli-reference.md`'s `agentform import` section for the command's exact flags and exit codes, `docs/troubleshooting.md`'s "Import issues" section for what to do when a run doesn't go as expected, and ADR-0003 for the full reasoning behind the `v1alpha1` versioning decision.
