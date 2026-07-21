# Agentform environment overlays

## Purpose

A specification is written once, but rarely deployed only once — the same agentic application typically needs a lower-cost model and a permissive policy posture in development, and a pinned model version with evaluation gates enabled in production. Environment overlays are how Agentform lets `agentform.yaml` stay the single source of truth for that application while letting individual fields differ per environment, without maintaining N complete, independently-authored copies of the document. An overlay is not a separate mechanism bolted onto the parser — it's one stage of `@agentform/parser`'s `loadProject` pipeline (`docs/parser-reference.md`): when a command is given `--environment <name>` and `environments/<name>.yaml` exists, that file is loaded through the same parse-and-resolve machinery as the main entry file, then deep-merged onto it before interpolation runs. The merge function itself, `mergeOverlay` (`packages/parser/src/overlays.ts`), is under thirty lines — the design goal (§20 of the build specification: "merge rules must be explicit and deterministic") is that an overlay's effect is fully predictable from reading the overlay file alone, not from guessing how a merge algorithm might resolve some ambiguous case.

## The `environments/<name>.yaml` file

An overlay file lives at `environments/<name>.yaml`, relative to the project root — a sibling of the `agents/`/`tools/`/`workflows/` auto-discovery directories described in `docs/parser-reference.md`'s multi-file project layout. It is found by presence, not by registration anywhere in `agentform.yaml`: the same "fixed, conventional filename" discipline `agentform.policy.yaml` uses (`docs/policy-reference.md`). If `--environment <name>` is passed and `environments/<name>.yaml` does not exist, nothing errors — see Troubleshooting below for why that's worth knowing.

An overlay file is a **fragment** of the same document shape as `agentform.yaml`, not a complete, independently-valid specification. It is never schema-validated on its own — only the final, merged-and-interpolated document is. A typical overlay names only what changes:

```yaml
# environments/production.yaml
spec:
  runtime:
    target: openai
    environment: production
  models:
    primary:
      temperature: 0
    fallback:
      provider: anthropic
      model: claude-sonnet-4-5
  policies:
    - AF001
    - AF002
    - AF008
    - AF013
```

An overlay file goes through the exact same `loadDocument` + `resolveReferences` steps the main entry file does (`project.ts`'s `loadAndResolve`, called once for the entry file and again for the overlay when one applies) — so an overlay's own `$ref`/`file`/`schemaRef` markers resolve too, relative to the overlay file's own location (`environments/`), following the same rule `docs/parser-reference.md` documents for every other reference: relative to whichever file currently contains the marker, not the project root.

## Merge semantics

`mergeOverlay(base, overlay)` applies exactly two rules, recursively:

- **Objects merge key-by-key.** Since every resource collection in the schema (`models`, `tools`, `agents`, `workflows`, `memory`, `outputs` — `packages/schema/src/application.ts`'s `spec` shape) is itself an object keyed by resource identifier, this rule _is_ merge-by-resource-identifier: an overlay entry for an existing resource identifier deep-merges onto it field by field; a new identifier under an existing collection adds a sibling resource without disturbing any other entry in that collection.
- **Arrays replace, never concatenate.** An overlay's `spec.policies: [...]` (or any other array-valued field) entirely replaces the base list. Appending would make an overlay's effect depend on file-read order in a way that isn't visible from reading the overlay alone — exactly the ambiguity §20 rules out.

The whole function, from `packages/parser/src/overlays.ts` (`isRecord` is a small local helper — true for anything that's a plain object, false for arrays/`null`/primitives):

```ts
export function mergeOverlay(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) {
    return base;
  }

  if (Array.isArray(overlay) || Array.isArray(base)) {
    return overlay;
  }

  if (isRecord(base) && isRecord(overlay)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, overlayValue] of Object.entries(overlay)) {
      merged[key] = key in merged ? mergeOverlay(merged[key], overlayValue) : overlayValue;
    }
    return merged;
  }

  return overlay;
}
```

Four consequences worth stating explicitly, each directly proven by a real case in `packages/parser/src/overlays.test.ts`:

- A key the overlay omits entirely is left untouched on the base — `mergeOverlay({ metadata: { name: 'app', version: '1.0.0' } }, { metadata: { version: '1.0.1' } })` produces `{ metadata: { name: 'app', version: '1.0.1' } }`; `name` survives because the overlay never mentioned it.
- An overlay entry for an existing resource deep-merges rather than replacing the whole resource: `{ spec: { models: { primary: { temperature: 0.7 } } } }` onto a base `primary` model changes only `temperature`, leaving `provider`/`model` as declared in the base.
- A new resource identifier under an existing collection is simply added, siblings untouched.
- A scalar (or a value whose type differs between base and overlay — an object where the base had a string, for instance) is replaced outright, the same as an array.
- An `overlay` of `undefined` — i.e., no `environments/<name>.yaml` was merged at all — returns the base value completely unchanged (this is also how a project with no `--environment` flag behaves: `mergeOverlay` is simply never called).

## Where the merge happens in the pipeline

`loadProject` (`packages/parser/src/project.ts`) runs, in order: entry-file discovery → parse and reference resolution → `agents/`/`tools`/`workflows/` auto-discovery → **environment overlay merge** → `${env.*}`/`${var.*}`/`${local.*}` interpolation. Two consequences follow directly from that ordering:

- The overlay is merged onto the document _after_ auto-discovered resources have already been folded in, so an overlay can override a field on a resource that was itself auto-discovered from `agents/researcher.yaml` — there's no special case for "which file originally contributed this resource."
- The overlay is merged _before_ interpolation runs, so `${var.*}`/`${env.*}`/`${local.*}` references written inside the overlay file itself are resolved in the same final interpolation pass as the rest of the document — an overlay can legitimately contain `temperature: ${var.prod_temperature}`.

If any diagnostic from an earlier stage is already an error, the overlay stage — and every stage after it — is skipped entirely (`project.ts`'s `!diagnostics.some((d) => d.severity === 'error')` guard): a project that fails to parse never gets an overlay applied to a document that doesn't exist yet.

## `--environment` across the CLI

Eleven commands accept `--environment <name>`, each wiring it straight through to `loadProject` via the shared `loadAndBuildIR` helper (`apps/cli/src/lib/pipeline.ts`):

| Command    | Effect                                                          |
| ---------- | --------------------------------------------------------------- |
| `validate` | Validates the merged document.                                  |
| `plan`     | Plans against the merged document.                              |
| `status`   | Reports on the merged document.                                 |
| `test`     | Runs evaluation datasets from the merged document.              |
| `compile`  | Compiles the merged document for a target framework.            |
| `apply`    | Applies the merged document.                                    |
| `drift`    | Checks drift against the merged document.                       |
| `rollback` | Regenerates artifacts from the merged document.                 |
| `graph`    | Renders the merged document's workflow graph.                   |
| `inspect`  | Resolves one address (or the summary) from the merged document. |
| `lockfile` | Resolves `spec.modules` from the merged document.               |

Four commands deliberately do **not** accept it:

- `init` — there is no document to overlay yet; it's what `init` creates.
- `format` — a style formatter over one named file, entirely independent of the `loadProject` pipeline (`docs/cli-reference.md`'s `agentform format` section).
- `import` — runs a separate, deliberately non-normal pipeline against `[sourceDir]` rather than `--cwd`'s resolved project (`docs/cli-reference.md`'s `agentform import` section; see also `docs/import-guide.md`).
- `destroy` — needs no valid, loadable specification to run at all (its plan is built purely from tracked deployed state); it reads the environment that was recorded at apply time directly off `ApplicationState.environment` instead (`apps/cli/src/commands/destroy.ts`), not from a `--environment` flag or the current source document.

**`--environment <name>` selects which overlay file is attempted; it does not itself set `spec.runtime.environment`.** These are two independent things that a well-formed overlay conventionally keeps in sync by explicitly declaring `runtime.environment: production` inside `environments/production.yaml`, but nothing enforces that convention structurally — passing `--environment production` against a project with no `environments/production.yaml` at all resolves the base document exactly as if the flag had been omitted, `runtime.environment` included. Confirmed directly: running `agentform status --environment staging` against a project with no `environments/staging.yaml` still prints `Environment: development` if that's what the base document's own `spec.runtime.environment` says.

## Worked example

Base `agentform.yaml`:

```yaml
apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication
metadata:
  name: research-assistant
  version: 1.0.0
spec:
  runtime:
    target: openai
    environment: development
  models:
    primary:
      provider: openai
      model: gpt-5
      temperature: 1
  agents:
    researcher:
      model: primary
      role: researcher
      instructions:
        text: Research the given topic and summarize findings.
  workflows:
    main:
      entrypoint: researcher
      nodes:
        researcher:
          type: agent
          agent: researcher
  policies:
    - AF001
    - AF002
```

`environments/production.yaml` (shown in full under Merge semantics above) changes `runtime.environment`, tightens `primary`'s `temperature` from `1` to `0`, adds a `fallback` model that doesn't exist in the base at all, and replaces the `policies` array wholesale. Running `agentform inspect model.primary --json` with and without `--environment production` shows the deep merge directly:

```jsonc
// no --environment
{ "provider": "openai", "model": "gpt-5", "temperature": 1, "fallbacks": [], "capabilities": [] }

// --environment production
{ "provider": "openai", "model": "gpt-5", "temperature": 0, "fallbacks": [], "capabilities": [] }
```

`provider`/`model` survive from the base untouched; only `temperature` — the one field the overlay actually named — changed. `agentform inspect model.fallback --environment production --json` resolves the resource the overlay added, which has no existence at all without `--environment production`:

```json
{ "provider": "anthropic", "model": "claude-sonnet-4-5", "fallbacks": [], "capabilities": [] }
```

This particular overlay also illustrates a real side effect worth expecting: `@agentform/policy`'s `isProductionEnvironment` (`packages/policy/src/production.ts`) matches `runtime.environment` against `/^prod(uction)?$/i`, and two mandatory policies — `AF008` (production requires evaluation gates) and `AF013` (production model aliases must be pinned) — only fire in an environment that matches. `agentform validate --environment production` against the example above now reports both, where `agentform validate` with no `--environment` reported zero policy failures:

```text
Error [AF008] [AF008 production-requires-evaluation-gates] Runtime environment "production" looks like production but spec.evaluations does not declare both datasets and thresholds. (at spec.evaluations)
Error [AF013] [AF013 production-model-aliases-must-be-pinned] Model "primary" has no pinned version in a production runtime environment. (at spec.models.primary.version)
Error [AF013] [AF013 production-model-aliases-must-be-pinned] Model "fallback" has no pinned version in a production runtime environment. (at spec.models.fallback.version)
```

Switching environments is rarely just a cosmetic label change — see `docs/policy-reference.md` for the full catalog.

## Scope

- **Exactly one overlay per run.** There is no syntax for naming more than one `--environment` value, and no concept of overlays composing on top of each other — `environments/<name>.yaml` is merged onto the base document exactly once, never chained.
- **Arrays always replace wholesale**, never merge by index or concatenate — see Merge semantics. There is no per-field annotation to opt an individual array into a different behavior.
- **An overlay is not a secrets mechanism.** It participates in the same `${env.*}`/`${var.*}`/`${local.*}` interpolation grammar every document gets (`docs/parser-reference.md`), nothing more — a value that needs to differ per environment because it's sensitive still belongs behind an environment-variable reference, not hardcoded into the overlay file.
- **The overlay fragment itself is never schema-validated in isolation** — only the fully merged, interpolated document is. An overlay like `spec: { models: { primary: { temperature: 0 } } }` is not independently a valid `AgenticApplication` (it's missing `models.primary.provider`, among everything else `spec` requires) and isn't expected to be; that's the entire point of a fragment.

## Security implications

- The overlay's own file _content_ is bound by exactly the same sandbox as the base document: `$ref`/`file`/`schemaRef` markers inside `environments/<name>.yaml` resolve through the same root-bounded `resolvePathRelativeToFile`/`resolvePathWithinRoot` machinery `docs/parser-reference.md` describes, and are subject to the same reference-cycle and max-depth limits.
- **The `--environment <name>` value itself is operator-supplied, not document content, and Agentform trusts it the same way it trusts `--cwd`** — but it is still sandboxed to the project root, the same as every other file reference. `environments/<name>.yaml` is validated through `resolvePathWithinRoot` before it's ever checked for existence or read (`packages/parser/src/project.ts`); a `--environment` value containing `../` segments that would resolve outside `rootDir` is rejected as `AGF1002`, and the file it would have pointed to is never read (`packages/parser/src/project.test.ts`'s "rejects a --environment value that resolves outside the project root" test proves this with a real canary file placed outside the fixture root). This wasn't always true — see `docs/security/threat-model.md`'s "Path traversal" entry for the Phase 12 fix — but the current behavior matches every other reference mechanism in this codebase: sandboxed regardless of how trusted the input's source is.
- No overlay merge ever executes anything — `mergeOverlay` is a pure structural walk over already-parsed values (no `eval`, no dynamic `import()`), the same "no expression language beyond a fixed grammar" guarantee `docs/parser-reference.md` documents for the rest of the parser.

## Troubleshooting

- **`--environment production` seems to do nothing**: check that `environments/production.yaml` actually exists at the project root. A named environment with no matching overlay file is not an error — `loadProject` silently falls back to the base document exactly as if `--environment` had been omitted. This is deliberate (the same "found by presence" convention `agentform.policy.yaml` uses), but it means a typo in the environment name (`--environment prod` when the file is `environments/production.yaml`) fails silently rather than loudly.
- **A field I only expected to see in `environments/production.yaml` is affecting my development run**: overlays only ever apply when `--environment <name>` is actually passed and matches an existing file — check the command line, not the document, if a change appears (or fails to appear) unexpectedly.
- **An array field didn't merge the way I expected**: arrays always replace wholesale, never merge by index or concatenate — see Merge semantics above. If you need the base list's entries preserved, the overlay must repeat them explicitly.
- **`agentform validate --environment production` newly fails with `AF008`/`AF013` that don't fail without `--environment`**: expected once `runtime.environment` resolves to something `isProductionEnvironment` recognizes (`prod`/`production`, case-insensitively) — see the Worked example above and `docs/policy-reference.md`.
- **A resource added only in the overlay (like this document's `model.fallback`) isn't found when inspecting without `--environment`**: also expected — `agentform inspect model.fallback` with no `--environment` resolves against the base document alone, where that resource was never declared.
