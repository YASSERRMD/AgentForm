# Agentform CLI reference

## Purpose

`agentform` is the user-facing entry point to the pipeline documented across `docs/{schema,parser,ir,policy,state,planner,compiler}-reference.md`: `init` scaffolds a project, `validate`/`inspect`/`graph`/`plan`/`status`/`compile` all run the same `loadProject → buildIR` pipeline (`apps/cli/src/lib/pipeline.ts`) and differ only in what they do with a successful result, and `format` normalizes source file style independently of that pipeline. `validate`/`plan`/`status` additionally run `@agentform/policy`'s built-in policy pack once the pipeline itself succeeds; `plan`/`status` also open the local state backend (`@agentform/state-local`) under `.agentform/`; `compile` runs `@agentform/compiler` against a `FrameworkAdapter` — see their own sections below.

## Global options

Every command accepts these (defined once on the root program):

| Flag                           | Effect                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json`                       | Machine-readable JSON on stdout instead of human-readable text.                                                                                                                         |
| `--no-color`                   | Disable ANSI colors, in addition to the automatic TTY/`NO_COLOR`/`FORCE_COLOR` detection every command already applies.                                                                 |
| `--verbose`                    | Raise the internal logger to `info`.                                                                                                                                                    |
| `--debug`                      | Raise the internal logger to `debug`.                                                                                                                                                   |
| `--quiet`                      | Suppress non-essential stdout output (diagnostics/results are not printed in human mode; `--json` output is unaffected, since it's the machine-readable contract, not "non-essential"). |
| `--cwd <path>`                 | Run as if `agentform` had been started in `<path>` — every command resolves the project root from this, not the real process cwd.                                                       |
| `-V, --version` / `-h, --help` | Standard Commander-provided flags.                                                                                                                                                      |

## Exit codes

Every command sets `process.exitCode` (never calls `process.exit()` directly mid-command, so pending output always flushes first) to one of the stable codes from §14:

| Code | Meaning                     | Where it comes from                                                                                                                                                                            |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success                     |                                                                                                                                                                                                |
| 1    | General failure             | e.g. `format --check` finding an unformatted file; a file that can't be read                                                                                                                   |
| 2    | Invalid command usage       | Unknown flag/command/argument (remapped from Commander's own default of `1` — see ADR-0006), an unknown `--format`/`--template`/`--target` value, an `inspect` address that doesn't resolve    |
| 3    | Source parsing failure      | Any `AGF1xxx` error from `@agentform/parser`                                                                                                                                                   |
| 4    | Schema validation failure   | Any `AGF2xxx` error from `@agentform/schema`                                                                                                                                                   |
| 5    | Semantic validation failure | Any `AGF3xxx` error from `@agentform/ir`                                                                                                                                                       |
| 6    | Policy failure              | Any built-in policy ID (`AF001`-`AF015`) reported as `fail`, or an `AGF4xxx` policy-configuration problem (e.g. a rejected mandatory-policy override) — `@agentform/policy`, `validate`/`plan` |
| 7    | Unapproved critical change  | `agentform plan` produced at least one `PlanItem` with `risk: 'CRITICAL'` (`requiresApproval: true`) — `@agentform/planner`, `plan` only                                                       |
| 8    | Compilation failure         | An `AGF5xxx` error from `@agentform/compiler` other than `AGF5001` (e.g. `AGF5003`, a blocked secret leak) — `compile` only                                                                    |
| 13   | Unsupported target feature  | `AGF5001` — the project uses a node/tool type the target adapter has no generator for (`docs/compiler-reference.md`) — `compile` only                                                          |

`lib/exit-codes.ts`'s `exitCodeForDiagnostics()` picks the code for the _earliest_ pipeline stage with an error, since that's the one whose fix actually unblocks the rest — a document that fails parsing produces exit 3 even if, hypothetically, it would also have failed schema validation (or policy checks, which don't even run until parsing/schema/semantic validation all succeed). `plan`'s own exit code layers on top: policy failure (6) takes priority over an unapproved critical change (7) — a plan with pending, non-critical, policy-clean changes exits 0, same as Terraform's `plan` treating "there are changes" as success on its own.

## Commands

### `agentform init [name]`

Scaffolds a new project from a starter template.

```bash
agentform init                                    # in --cwd, prompts if interactive
agentform init my-project                          # new ./my-project subdirectory
agentform init --template government-complaint      # pick a specific template
agentform init --target langgraph                    # set spec.runtime.target
agentform init --non-interactive                      # never prompt
```

Five templates (`--template <id>`):

| id                     | What it demonstrates                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `basic` (default)      | One model, one agent, no tools — the smallest valid project.                                                                   |
| `tool-agent`           | An agent with one MCP tool it's explicitly granted.                                                                            |
| `multi-agent`          | A researcher + writer agent pair with a bounded (`maxIterations`) review loop.                                                 |
| `human-approval`       | A low-confidence-routes-to-approval pattern before a write-capable tool runs.                                                  |
| `government-complaint` | The full canonical regulated-government example — `file`/`schemaRef` references, data-residency labels, evaluation thresholds. |

Every template except `human-approval` and `government-complaint` passes `agentform validate` immediately after generation with zero further setup. Those two reference a real external API via `${env.*}` and require setting the variable(s) listed in the generated `.env.example`/README first — this is deliberate (§3.5 "safe by default": a template pointing at a real write-capable API shouldn't silently validate against a fake placeholder URL), not a rough edge.

Interactive mode (prompts for whichever of name/template wasn't given as a flag) only activates when `--non-interactive` is absent **and** both stdin and stdout are a real TTY — piped input (as in any CI run or the e2e test suite) is correctly detected as non-interactive and falls back to defaults (`basic` template, directory basename as the project name) rather than hanging on a prompt that will never receive real terminal input.

`init` refuses to overwrite an existing `agentform.yaml`/`.yml`/`.json` in the target directory rather than silently clobbering it.

### `agentform validate`

Runs the full pipeline — parsing, schema, semantic, then policy — and reports every diagnostic.

```bash
agentform validate
agentform validate --strict           # warnings (including policy warnings) also fail
agentform validate --environment production
agentform --json validate
```

Policy checks run `@agentform/policy`'s 15 built-in policies (`docs/policy-reference.md`) against the document once parsing/schema/semantic validation all succeed — evaluating policy against a document already broken in a more fundamental way would just add confusing secondary output. A `fail`-status policy result is an error diagnostic (blocks, exit 6, with or without `--strict`); a `warn`-status result is a warning diagnostic (blocks only under `--strict`, same as any other stage's warnings). Each diagnostic's `code` is the policy ID itself (e.g. `AF003`), so it's visible directly in both human and `--json` output.

An optional `agentform.policy.yaml` at the project root configures per-policy severity overrides — same "found by fixed filename, absent is fine" convention as `environments/<name>.yaml`:

```yaml
overrides:
  AF006:
    severity: skip
    justification: timeouts enforced at the gateway layer
```

A mandatory policy's severity can never be overridden (attempting to produces an `AGF4001` diagnostic and the override is ignored); a non-mandatory override that _weakens_ severity requires a non-empty `justification` (`AGF4002` otherwise). There is no CLI flag to point at a different config file or to skip policy checks entirely — see the Security implications section below for why.

`--json` output includes a `policyResults` field: the full array of all 15 results (`pass`/`warn`/`fail`/`skip`), not just the ones that became diagnostics — useful for tooling that wants to show "everything that was checked," not only what failed.

### `agentform format [file]`

Deterministically reformats one YAML/JSON file (default: the project's entry file).

```bash
agentform format                      # rewrite the entry file in place
agentform format --check              # exit 1 if it isn't already formatted, don't write
agentform format ./agents/researcher.yaml
```

JSON files stay JSON; YAML files are re-serialized with fixed style (2-space indent, no automatic line-wrapping) while preserving key order — this is a style formatter, not the content-canonicalizing that `@agentform/ir`'s content hash does for a completely different purpose (see `docs/ir-reference.md`).

### `agentform inspect [address]`

Prints one resolved resource, or an application summary when no address is given.

```bash
agentform inspect                     # summary: metadata + resource counts + content hash
agentform inspect agent.intake
agentform inspect workflow.main --json
```

Address format is `<kind>.<id>` where `kind` is one of `model`, `tool`, `agent`, `workflow`, `memory`, `output`.

### `agentform graph`

Generates a Mermaid, DOT, or JSON representation of a workflow's graph.

```bash
agentform graph                        # mermaid, every workflow in the project
agentform graph --format dot
agentform graph --format json
agentform graph --workflow main --output workflow.mmd
```

With no `--workflow`, every workflow in the project is rendered (concatenated for Mermaid/DOT, an array for JSON). The entrypoint node gets a visually distinct shape (Mermaid stadium / DOT double-circle) in both text formats.

### `agentform plan`

Compares the desired specification against deployed state without changing either.

```bash
agentform plan
agentform plan --out plan.afplan       # save a tamper-evident plan file
agentform plan --environment production
agentform --json plan
```

Runs the full pipeline, opens the local state backend (`@agentform/state-local`, `.agentform/state.db`) **read-only** — `plan` never acquires the state lock and never calls any mutating `StateBackend` method, so "failed planning never mutates state" holds structurally, not just by convention — compares desired resources against stored ones (`@agentform/planner`'s `comparePlan`), and runs policy checks against the plan exactly like `validate` does (§15.6). Output matches §9's example shape: a `+`/`~`/`!`/`-` prefixed line per changed resource (unchanged resources are omitted) with its reasons and risk, then a `Plan: N to create, N to change, N to destroy.` summary.

`--out <file>` additionally saves the plan as a tamper-evident `.afplan` file (`docs/planner-reference.md`) — JSON with a content hash covering everything in it, so editing the file afterward is detectable. `--json` output includes the full `items` array (every `PlanItem`, including `NO_OP`s) alongside `policyResults`, mirroring `validate`'s `--json` shape.

### `agentform status`

Shows the application, deployed state, and policy status (§15.10).

```bash
agentform status
agentform --json status
```

Always exits 0 once the pipeline itself succeeds — like `inspect`, this is a read-only reporting command, not a pass/fail gate. `Policy:` reflects a real `evaluatePolicies` run against the current specification (`PASSED`/`PASSED (with warnings)`/`FAILED`); `Drift:` and `Evaluation:` honestly report `unknown (... not implemented until a later phase)` rather than fabricating data — no drift detection (`agentform drift`) or evaluation engine exists yet to produce a real answer for either.

### `agentform compile`

Generates a real project for a target framework from the specification (`docs/compiler-reference.md`).

```bash
agentform compile                          # the project's declared spec.runtime.target
agentform compile --target langgraph       # a specific target, overriding runtime.target
agentform compile --all                    # every target this build currently supports
agentform compile --output ./out --clean   # custom output dir, wiping it first
agentform --json compile
```

Only `openai` and `langgraph` have a registered adapter as of Phase 8 — `microsoft`/`google-adk`/`autogen`/`crewai` are valid `runtime.target` schema values but land in Phase 9; requesting one exits 2 with a message naming what's currently available, not a silent no-op. `--target` and `--all` cannot be combined.

`--output` (default `./generated`) resolves against `--cwd`, not the real process working directory — unlike `graph`'s/`plan`'s `--output`/`--out` (arbitrary user-chosen file paths with no default), it's meant as "relative to the project being compiled," matching every `generated/<target>/` layout in the spec. Each target's files are written under `<output>/<target>/`, alongside a `manifest.json` (§22's exact shape, `generatedAt` always `null`). `--clean` removes a target's existing output subdirectory before writing — scoped to that one subdirectory, never anything else.

Compilation never deploys anything — `compile` only ever calls an adapter's `validateCompatibility`/`generate`, never `deploy`/`destroy` (those don't exist yet; see `docs/compiler-reference.md`'s Scope section). A project using a node/tool type one target's adapter can't generate writes no files for that target and contributes an `AGF5001` diagnostic; with `--all`, every _other_ requested target still compiles and writes normally, but the overall exit code reflects the worst diagnostic across all of them — so a `--all` run can exit 13 while still having written a complete, successful project for the target(s) that didn't have the problem. Check the per-target `diagnostics` (`--json`) or the per-target block (human output) to see which target(s) actually failed. `--json` output includes a `targets` array (one entry per compiled target: `outputDir`, `filesWritten`, `manifest`, `diagnostics`) and a `skippedTargets` array (present, possibly empty, only meaningful with `--all`).

## Security implications

- `init`/`format` are the only commands that write to disk unconditionally, and both are conservative: `init` refuses to overwrite an existing entry file; `format` only ever rewrites the exact file it was asked to format (never walks the project writing to files the user didn't name or that weren't already the discovered entry file). `plan --out <file>` also writes, but only the file the user explicitly named. `compile` writes an entire generated project, but only under `<output>/<target>/`, and only `--clean` ever deletes anything (scoped to that one subdirectory).
- `plan`/`status` never store raw resource values in `.agentform/state.db` — see `docs/state-reference.md`.
- No command executes generated or user-supplied code — `graph`'s Mermaid/DOT/JSON output is text generation from the already-validated IR, not template execution; `compile`'s generated files are written to disk, never executed by `agentform` itself.
- Diagnostics never include secret values — they come from `@agentform/parser`/`@agentform/schema`/`@agentform/ir`/`@agentform/policy`, none of which read or echo secret material (§3.5, §18); a policy message that names a detected secret runs it through `redactSecretValue` first. `compile` additionally blocks on any generated file that looks like it contains a secret — see `docs/compiler-reference.md`.
- **Mandatory policies cannot be bypassed with CLI flags** (§16's own acceptance criterion): there is no `--no-policy`/`--skip-policy` flag, no way to pass overrides inline on the command line, and no flag to point `agentform.policy.yaml` at a different file. The _only_ lever is the fixed-filename config file, and even that file cannot change a mandatory policy's severity — `evaluatePolicies` rejects the attempt regardless of what the config says.

## Troubleshooting

- **A command hangs with no output**: you're very likely in `init`'s interactive path with stdin that isn't actually connected to a terminal (e.g. running inside some non-interactive wrapper that still reports `isTTY: true`). Pass `--non-interactive` explicitly.
- **`agentform format` "fixes" something you didn't expect**: check whether the file is JSON or YAML — JSON files are never rewritten into YAML syntax, and YAML files never get their keys reordered, only their whitespace/quote style normalized.
- **Exit code 2 for what looks like a real validation problem**: 2 is reserved for _usage_ errors (a bad flag, an unknown `inspect` address, an unknown `--template`) — a genuine document problem always exits 3/4/5/6/7, never 2.
- **An override in `agentform.policy.yaml` doesn't seem to apply**: check for an `AGF4001`/`AGF4002` diagnostic in the output — a mandatory policy's severity can't be overridden at all, and a non-mandatory _downgrade_ (e.g. `error` to `warning`) needs a non-empty `justification` or it's rejected and the default severity is kept.
- **`agentform validate`/`agentform plan` exits 6 but you expected 0**: a policy fired at `error` severity. The diagnostic's `code` is the policy ID (e.g. `AF003`) — check `docs/policy-reference.md` for what that policy checks and how to fix the underlying document, or (if it's genuinely not mandatory and you have a real reason) add a justified override.
- **`agentform plan` exits 7**: at least one plan item is `CRITICAL` risk — check `docs/planner-reference.md`'s risk classification section for what triggers it (deleting a workflow, or a workflow with an ungated destructive-tool call).
- **`agentform plan`/`agentform status` seem to hang or a `.agentform/` directory unexpectedly appears**: both commands create `.agentform/state.db` on first run (SQLite's default behavior for a database file that doesn't exist yet) — this is expected, not an error; see `docs/state-reference.md`.
- **`agentform compile` exits 13**: the project uses a node/tool type the target adapter has no generator for — the diagnostic names the specific feature and target. See `docs/compiler-reference.md`'s tables for what each adapter currently supports.
- **`agentform compile --target <name>` exits 2 saying "not yet supported"**: `<name>` is a schema-valid `runtime.target` value, but Phase 8 only registered `openai`/`langgraph` adapters — the other four land in Phase 9.
- **Generated code throws/raises the moment you run it**: expected — Agentform generates a project's interface (agents, tools, graph wiring), never its business logic. See the `TODO` in the specific file the error names.
