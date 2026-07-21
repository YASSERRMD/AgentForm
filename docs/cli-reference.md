# Agentform CLI reference

## Purpose

`agentform` is the user-facing entry point to the pipeline documented across `docs/{schema,parser,ir,policy,state,planner,compiler,evaluation,registry}-reference.md`: `init` scaffolds a project, `validate`/`inspect`/`graph`/`plan`/`status`/`compile`/`test`/`apply`/`drift`/`lockfile` all run the same `loadProject → resolveProjectModules → buildIR` pipeline (`apps/cli/src/lib/pipeline.ts`) and differ only in what they do with a successful result, and `format` normalizes source file style independently of that pipeline. `validate`/`plan`/`status`/`test`/`apply` additionally run `@agentform/policy`'s built-in policy pack once the pipeline itself succeeds; `plan`/`status`/`apply`/`drift`/`rollback`/`destroy` also open the local state backend (`@agentform/state-local`, or `@agentform/state-postgres` when `AGENTFORM_STATE_POSTGRES_URL` is set) under `.agentform/`, and `apply`/`rollback`/`destroy` are the only commands that actually mutate it (ADR-0012, ADR-0013); `compile`/`apply` run `@agentform/compiler` against a `FrameworkAdapter`; `test`/`apply` run `@agentform/evaluator`/`@agentform/runtime` against the specification's declared evaluation datasets; `lockfile` is the one command whose primary output is about `@agentform/registry`'s module resolution rather than the specification itself (ADR-0014); `import` is the one command that does _not_ run the normal pipeline against `--cwd` — it inspects a separate `[sourceDir]` (an external, not-yet-Agentform project) and produces a candidate specification instead — see their own sections below.

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

| Code | Meaning                     | Where it comes from                                                                                                                                                                                                                                                 |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success                     |                                                                                                                                                                                                                                                                     |
| 1    | General failure             | e.g. `format --check` finding an unformatted file; a file that can't be read                                                                                                                                                                                        |
| 2    | Invalid command usage       | Unknown flag/command/argument (remapped from Commander's own default of `1` — see ADR-0006), an unknown `--format`/`--template`/`--target` value, an `inspect` address that doesn't resolve                                                                         |
| 3    | Source parsing failure      | Any `AGF1xxx` error from `@agentform/parser`                                                                                                                                                                                                                        |
| 4    | Schema validation failure   | Any `AGF2xxx` error from `@agentform/schema`                                                                                                                                                                                                                        |
| 5    | Semantic validation failure | Any `AGF3xxx` error from `@agentform/ir`                                                                                                                                                                                                                            |
| 6    | Policy failure              | Any built-in policy ID (`AF001`-`AF015`) reported as `fail`, or an `AGF4xxx` policy-configuration problem (e.g. a rejected mandatory-policy override) — `@agentform/policy`, `validate`/`plan`/`apply`                                                              |
| 7    | Unapproved critical change  | `agentform plan` produced at least one `PlanItem` with `risk: 'CRITICAL'` (`requiresApproval: true`); `agentform apply` hit the same condition non-interactively without `--auto-approve` — `@agentform/planner`, `plan`/`apply`                                    |
| 8    | Compilation failure         | An `AGF5xxx` error from `@agentform/compiler` other than `AGF5001` (e.g. `AGF5003`, a blocked secret leak), including during `apply`'s artifact-generation step — `compile`/`apply`                                                                                 |
| 9    | Evaluation failure          | At least one dataset test case failed its assertions, or a recognized threshold gate failed, or dataset loading itself errored (a missing file, invalid JSON/YAML, a test case that fails schema validation) — `@agentform/evaluator`, `test`/`apply` (smoke tests) |
| 10   | Apply failure               | A saved plan is stale, `adapter.deploy()` reported failure, or (§14's table reserves no separate code for it — ADR-0013) any `agentform destroy` failure — `apply`/`destroy` share this code                                                                        |
| 11   | State lock failure          | `.agentform/lock` is held by another live process (or a stale one within `staleTimeoutMs`) — `apply`/`rollback`/`destroy`, the three commands that acquire the lock                                                                                                 |
| 12   | Drift detected              | `agentform drift --exit-code` found at least one kind of drift — opt-in only; without `--exit-code`, drift is reported but the exit code stays 0 (ADR-0012) — `drift` only                                                                                          |
| 13   | Unsupported target feature  | `AGF5001` — the project uses a node/tool type the target adapter has no generator for (`docs/compiler-reference.md`) — `compile`/`apply`                                                                                                                            |
| 14   | Import failure              | `agentform import` recognized no supported project in `[sourceDir]`, the source directory doesn't exist, or the output file already exists — `import` only                                                                                                          |
| 15   | Rollback failure            | No apply history (or none with a backup) to roll back to, an unknown `--to`/unreadable `--snapshot`, a declined or non-interactive confirmation, or an unexpected failure during restoration — `rollback` only                                                      |

`lockfile` reuses two existing codes rather than reserving new ones (§14's table is closed at 15 — see ADR-0013's identical reasoning for destroy): a module-resolution error (`AGF7xxx`) exits 5 (`exitCodeForDiagnostics`'s fallthrough bucket — see its doc comment in `lib/exit-codes.ts`), and `--check` finding `agentform.lock` out of date exits 1 (`GENERAL_FAILURE`).

`lib/exit-codes.ts`'s `exitCodeForDiagnostics()` picks the code for the _earliest_ pipeline stage with an error, since that's the one whose fix actually unblocks the rest — a document that fails parsing produces exit 3 even if, hypothetically, it would also have failed schema validation (or policy checks, which don't even run until parsing/schema/semantic validation all succeed). `plan`'s own exit code layers on top: policy failure (6) takes priority over an unapproved critical change (7) — a plan with pending, non-critical, policy-clean changes exits 0, same as Terraform's `plan` treating "there are changes" as success on its own. `apply` reuses this same layering — policy failure is still 6, and a critical change blocks the same way (7) whether the source is `plan` or `apply`, since both call the same `@agentform/planner`.

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

In a production-labeled `runtime.environment` that also declares at least one evaluation dataset or threshold, `plan` additionally reads back `.agentform/test-results.json` (written by `agentform test`) and surfaces `AGF6001`/`AGF6002`/`AGF6003` — evaluation gates never run, stale (the specification changed since the last run), or failed, respectively — as `warning` diagnostics (`docs/evaluation-reference.md`). These are always warnings: there is no `agentform apply` yet (Phase 11) to actually block on them, so they never change `plan`'s exit code.

### `agentform status`

Shows the application, deployed state, policy status, and evaluation gate status (§15.10).

```bash
agentform status
agentform --json status
```

Always exits 0 once the pipeline itself succeeds — like `inspect`, this is a read-only reporting command, not a pass/fail gate. `Policy:` reflects a real `evaluatePolicies` run against the current specification (`PASSED`/`PASSED (with warnings)`/`FAILED`); `Evaluation:` reflects the same gate status `plan` computes (`docs/evaluation-reference.md`) regardless of environment — `never run`, `stale (...)`, `FAILED (n/m passed at <timestamp>)`, `PASSED (n/m at <timestamp>)`, or `not applicable (...)` when the specification declares no datasets or thresholds at all. `Drift:` still honestly reports `unknown (drift detection is not implemented until a later phase)` — no `agentform drift` exists yet to produce a real answer.

### `agentform test`

Runs the specification's evaluation datasets against the deterministic mock execution engine (`docs/evaluation-reference.md`).

```bash
agentform test
agentform test --environment production
agentform test --junit results.xml            # also write a JUnit XML report
agentform --json test
agentform test --live                          # rejected — not yet implemented
```

Runs the full pipeline, then policy once (`policyResult` assertions and the `policyViolations` threshold read this same evaluation), then loads every dataset `spec.evaluations.datasets` names (`docs/evaluation-reference.md`'s dataset format) and runs each test case through `@agentform/runtime`'s deterministic engine. A dataset-loading error (missing file, invalid JSON/YAML/JSONL, a test case that fails schema validation) exits 9 immediately, naming the problem, the same way a broken specification exits 4/5/6 rather than crashing.

Every run — pass or fail — writes `.agentform/test-results.json`, a tamper-evident record `agentform plan`/`agentform status` read back (`docs/evaluation-reference.md`'s Tamper-evident results record section).

`--junit <file>` additionally writes a standard JUnit XML report. Console, `--json`, and JUnit output are all passed through the same secret-redaction pass before being written anywhere — see Security implications below.

`--live` exists as a recognized flag but is rejected immediately (exit 2, a clear message) rather than silently behaving like its absence — there is no live-provider execution engine yet (`docs/evaluation-reference.md`'s Scope section).

### `agentform compile`

Generates a real project for a target framework from the specification (`docs/compiler-reference.md`).

```bash
agentform compile                          # the project's declared spec.runtime.target
agentform compile --target langgraph       # a specific target, overriding runtime.target
agentform compile --all                    # every target this build currently supports
agentform compile --output ./out --clean   # custom output dir, wiping it first
agentform --json compile
```

All six `runtime.target` schema values (`openai`, `langgraph`, `microsoft`, `google-adk`, `autogen`, `crewai`) have a registered adapter as of Phase 9; an unrecognized `--target` exits 2 with a message naming what's available. `--target` and `--all` cannot be combined.

`--output` (default `./generated`) resolves against `--cwd`, not the real process working directory — unlike `graph`'s/`plan`'s `--output`/`--out` (arbitrary user-chosen file paths with no default), it's meant as "relative to the project being compiled," matching every `generated/<target>/` layout in the spec. Each target's files are written under `<output>/<target>/`, alongside a `manifest.json` (§22's exact shape, `generatedAt` always `null`). `--clean` removes a target's existing output subdirectory before writing — scoped to that one subdirectory, never anything else.

Compilation never deploys anything — `compile` only ever calls an adapter's `validateCompatibility`/`generate`, never `deploy`/`destroy`. Those two hooks exist on `FrameworkAdapter` (Phase 8's placeholder, given real callers by `agentform apply`/`agentform destroy` in Phase 11 — see below) but no adapter implements either yet; `compile` itself never calls them regardless. A project using a node/tool type one target's adapter can't generate writes no files for that target and contributes an `AGF5001` diagnostic; with `--all`, every _other_ requested target still compiles and writes normally, but the overall exit code reflects the worst diagnostic across all of them — so a `--all` run can exit 13 while still having written a complete, successful project for the target(s) that didn't have the problem. Check the per-target `diagnostics` (`--json`) or the per-target block (human output) to see which target(s) actually failed. `--json` output includes a `targets` array (one entry per compiled target: `outputDir`, `filesWritten`, `manifest`, `diagnostics`).

### `agentform apply [planFile]`

Applies the specification: generates artifacts and persists deployed state (§15.9, ADR-0012).

```bash
agentform apply                            # compute a fresh plan and apply it
agentform apply plan.afplan                # apply a previously saved, verified plan
agentform apply --auto-approve             # skip interactive confirmation for CRITICAL changes
agentform apply --target langgraph         # override runtime.target for this apply
agentform --json apply
```

An 11-step sequence (ADR-0012's Decision section has the full list): acquire the state lock → load/verify a saved plan file if one was given (its content hash is checked via `verifyPlanFile`, same as `plan --out` writes) → revalidate the current source from scratch → recompute the plan fresh against current deployed state, rejecting a stale saved plan (the specification or deployed state changed since it was made) → re-run policy (never skipped, not even with `--auto-approve`) → confirm any `CRITICAL`-risk items interactively, or fail (exit 7) non-interactively without `--auto-approve` → back up state → generate artifacts (the same `generated/<target>/` output `compile` produces) → call `adapter.deploy()` if the target's adapter implements it (none do yet — writing generated files to disk _is_ the materialization until one does) → run smoke tests against `spec.evaluations.datasets` (the same deterministic engine `agentform test` uses) → persist every resource-state change and the new `ApplicationState` atomically, then record the apply in history → release the lock.

A no-op apply (deployed state already matches the specification) exits 0 immediately after the plan comparison, before touching policy, artifacts, or state at all. `--json` output includes `applyId`, the full `items` array, `policyDiagnostics`, `filesWritten`, and `outputDir`.

### `agentform drift`

Detects differences between the specification, deployed state, and what's actually on disk, without changing any of them (§15.11, ADR-0012).

```bash
agentform drift
agentform drift --exit-code                # exit 12 if any drift is found
agentform drift --target langgraph
agentform --json drift
```

Four checks, all real, none simulated: **resource drift** (`comparePlan`'s non-`NO_OP` output — the same comparison `agentform plan` shows, already covering prompt-text and tool-schema changes as part of a resource's content hash), **environment drift** (the declared `runtime.environment` vs. what was actually last applied), **adapter-version drift** (the installed adapter's `manifest.version` vs. what's recorded in state), and **artifact drift** (the on-disk `generated/<target>/manifest.json`'s `irHash` vs. the current specification's). ADR-0012 explains why the other three kinds §15.11 lists (prompt drift, tool-schema drift, runtime-deployment drift) aren't separate checks — the first two are already covered by resource drift, and the third needs a live-deployment inspection capability no adapter has.

Every run caches its result onto `ApplicationState.driftStatus`/`driftCheckedAt` via `recordDriftStatus` — `agentform status`'s `Drift:` line reads this cache rather than recomputing live. `--exit-code` is opt-in (default: report drift, exit 0 regardless) — the same "report, don't gate by default" precedent `plan` established for pending changes.

### `agentform rollback`

Restores deployed state to a previous apply or snapshot (§15.13, ADR-0013).

```bash
agentform rollback                              # undo the most recent apply
agentform rollback --to <applyId>               # roll back to right before a specific apply
agentform rollback --snapshot <backupId>        # roll back to a specific state snapshot directly
agentform rollback --auto-approve
```

Three ways to pick a target, resolved by `resolveRollbackTarget` (default: the most recent apply-history entry's backup — "undo the last apply"; `--to`/`--snapshot` are mutually exclusive, exit 2 if both are given). Rollback always regenerates artifacts from the **current** on-disk specification (Agentform never stores a raw historical specification to regenerate from exactly) — when the snapshot's recorded IR hash no longer matches, `regenerationStale: true` is reported honestly rather than silently producing artifacts that don't match the restored state. Rollback **never erases apply history** — it computes a diff against the target snapshot and appends a new history record describing the rollback, exactly like every other apply-history entry (ADR-0013's central decision). Confirmation works the same as `apply`'s critical-change gate: interactive "yes", `--auto-approve`, or exit 15 non-interactively.

### `agentform destroy`

Destroys every resource currently tracked in deployed state (§15.14, ADR-0013).

```bash
agentform destroy --plan             # show what would be destroyed, change nothing
agentform destroy                    # requires confirmation
agentform destroy --auto-approve
```

Builds its plan from tracked state alone (`planDestroy`, `@agentform/planner`) — every resource `agentform status` currently counts becomes a `DELETE`, in reverse dependency order, **regardless of what (or whether) a current specification declares**. This means `destroy` needs no valid, loadable specification to run, unlike every other command — the point is tearing down what's deployed even when the project that produced it is now broken or gone. Confirmation is unconditional (any tracked resource at all triggers it, not just `CRITICAL`-risk ones) and names exactly what can't be recovered: generated artifact directories about to be deleted from disk, and (once an adapter implements `destroy`) any live deployment about to be torn down — resource _state_ itself is deliberately not listed, since it's backed up first and recoverable via `agentform rollback --snapshot <backupId>`. No exit code is reserved specifically for destroy; failures share `APPLY_FAILURE` (10) with `apply` (ADR-0013).

### `agentform import [sourceDir]`

Inspects an existing project and produces a candidate Agentform specification (§15.12, limited scope by design).

```bash
agentform import                              # inspect --cwd
agentform import ./legacy-project             # inspect a specific directory
agentform import --out candidate.yaml         # default: agentform.import.yaml
```

Three recognizers are tried in order, first actionable match wins: **a generated Agentform project** (adapter-agnostic — reads `manifest.json` plus every generated file's own `// Source: <address>`/`# Source: <address>` header comment, recovering resource identity at full confidence without attempting to reconstruct field values from generated code), **a raw OpenAI Agents SDK project** (`adapter-openai`'s `inspectExisting` — regex-based scanning for `Agent(...)`/`tool(...)` call sites and `@function_tool` decorators, recovering only literal string arguments), and **a raw LangGraph project** (`adapter-langgraph`'s `inspectExisting` — scans for `StateGraph`/`add_node`/`add_edge`/`set_entry_point`, defaulting every node to type `"agent"` rather than guessing its real type). If none recognize `[sourceDir]` (default `--cwd`), exits 14 naming what `import` currently supports.

The written file is always a separate `agentform.import.yaml` (or `--out`'s target), never `agentform.yaml` directly, and `import` refuses to overwrite an existing file at that path — a low-confidence candidate specification should never silently become a project's real entry file. Every recognized result reports a confidence score (heuristic results are never reported as 1.0 except for the generated-project recognizer's resource-identity recovery, which genuinely is exact), a list of unsupported constructs (what was detected but not translated), and concrete manual follow-up actions. §15.12's own instruction is explicit: never claim perfect reverse engineering — the candidate specification is a reviewed starting point, not a finished project, and running `agentform validate` against it afterward is always the expected next step.

### `agentform lockfile`

Resolves every `spec.modules` entry against the configured registry and writes `agentform.lock` (Phase 12, `@agentform/registry`, ADR-0014).

```bash
agentform lockfile                    # resolve and write agentform.lock
agentform lockfile --check            # compare against the existing lockfile, write nothing
agentform lockfile --environment production
```

Runs the same `loadAndBuildIR` pipeline every other diagnostics-producing command does, so a module-resolution error is reported exactly like a schema or semantic error would be. On success, `agentform.lock` records each resolved module's `source`/`version`/`contentHash`/`signatureVerified`, sorted by id (`docs/registry-reference.md`). `--check` never writes — it compares a fresh resolution against what's already on disk and exits non-zero (`GENERAL_FAILURE`) if they differ, suited to a CI gate that wants to catch registry drift (a module re-published with different content at the same version) without every invocation rewriting the lockfile. A project with no `spec.modules` at all still produces a valid (empty) lockfile — `lockfile` never assumes a project uses modules.

## Security implications

- `init`/`format` are the only read/validate-tier commands that write to disk unconditionally, and both are conservative: `init` refuses to overwrite an existing entry file; `format` only ever rewrites the exact file it was asked to format (never walks the project writing to files the user didn't name or that weren't already the discovered entry file). `plan --out <file>` also writes, but only the file the user explicitly named. `compile` writes an entire generated project, but only under `<output>/<target>/`, and only `--clean` ever deletes anything (scoped to that one subdirectory). `test` writes `.agentform/test-results.json` on every run, plus `--junit <file>` if given. `import` refuses to overwrite an existing candidate file at its `--out` path, the same discipline `init` applies to the entry file.
- **`apply`/`rollback`/`destroy` are the only commands that mutate `.agentform/state.db`, and all three are transactional and backed-up.** Every resource-state/application-state write happens inside `withTransaction` — a failure partway through leaves state exactly as it was before, never half-written (proven directly: `apply.test.ts`'s smoke-test-failure case, `rollback.test.ts`'s unreadable-snapshot case). All three call `createBackup()` before making any change, so every mutation has an undo point reachable via `agentform rollback --snapshot <backupId>` — including a destroy, and including a rollback itself. See ADR-0012/ADR-0013 and `docs/state-reference.md`.
- **`destroy` is the one command that deletes something with no built-in undo**: generated artifact directories on disk, and (once an adapter implements `destroy`) a live deployment. It says so explicitly before ever asking for confirmation — see the `agentform destroy` section above.
- `plan`/`status`/`test`/`apply`/`drift`/`rollback`/`destroy` never store raw resource values in `.agentform/state.db` — see `docs/state-reference.md`. `.agentform/test-results.json` similarly stores only pass/fail counts and content hashes, never test-case content.
- No command executes generated or user-supplied code — `graph`'s Mermaid/DOT/JSON output is text generation from the already-validated IR, not template execution; `compile`/`apply`'s generated files are written to disk, never executed by `agentform` itself; `test`/`apply`'s deterministic mock engine never calls a real model, tool, HTTP endpoint, or subprocess (`docs/evaluation-reference.md`); `import`'s source recognizers only ever read and pattern-match file contents as text — they never `import`/`require`/execute anything from the project being inspected.
- Diagnostics never include secret values — they come from `@agentform/parser`/`@agentform/schema`/`@agentform/ir`/`@agentform/policy`, none of which read or echo secret material (§3.5, §18); a policy message that names a detected secret runs it through `redactSecretValue` first. `compile`/`apply` additionally block on any generated file that looks like it contains a secret — see `docs/compiler-reference.md`. `test`'s console/`--json`/`--junit` output is separately passed through the same secret-pattern redaction before being written anywhere, since a dataset's mocked tool call content is author-controlled test-fixture data `AF001` never scans (`docs/evaluation-reference.md`).
- **Mandatory policies cannot be bypassed with CLI flags** (§16's own acceptance criterion): there is no `--no-policy`/`--skip-policy` flag, no way to pass overrides inline on the command line, and no flag to point `agentform.policy.yaml` at a different file. The _only_ lever is the fixed-filename config file, and even that file cannot change a mandatory policy's severity — `evaluatePolicies` rejects the attempt regardless of what the config says. `agentform apply --auto-approve` skips only the interactive critical-change confirmation, never policy — a policy failure still exits 6 with `--auto-approve` present.
- `import`'s heuristic recognizers never treat a `1.0` confidence as license to skip review — only the generated-project recognizer's resource-_identity_ recovery (reading Agentform's own header comments) is ever reported at full confidence, and even then only identity, never field values. The written candidate specification is never promoted to `agentform.yaml` automatically.

## Troubleshooting

- **A command hangs with no output**: you're very likely in `init`'s interactive path with stdin that isn't actually connected to a terminal (e.g. running inside some non-interactive wrapper that still reports `isTTY: true`). Pass `--non-interactive` explicitly.
- **`agentform format` "fixes" something you didn't expect**: check whether the file is JSON or YAML — JSON files are never rewritten into YAML syntax, and YAML files never get their keys reordered, only their whitespace/quote style normalized.
- **Exit code 2 for what looks like a real validation problem**: 2 is reserved for _usage_ errors (a bad flag, an unknown `inspect` address, an unknown `--template`) — a genuine document problem always exits 3/4/5/6/7, never 2.
- **An override in `agentform.policy.yaml` doesn't seem to apply**: check for an `AGF4001`/`AGF4002` diagnostic in the output — a mandatory policy's severity can't be overridden at all, and a non-mandatory _downgrade_ (e.g. `error` to `warning`) needs a non-empty `justification` or it's rejected and the default severity is kept.
- **`agentform validate`/`agentform plan` exits 6 but you expected 0**: a policy fired at `error` severity. The diagnostic's `code` is the policy ID (e.g. `AF003`) — check `docs/policy-reference.md` for what that policy checks and how to fix the underlying document, or (if it's genuinely not mandatory and you have a real reason) add a justified override.
- **`agentform plan` exits 7**: at least one plan item is `CRITICAL` risk — check `docs/planner-reference.md`'s risk classification section for what triggers it (deleting a workflow, or a workflow with an ungated destructive-tool call).
- **`agentform plan`/`agentform status` seem to hang or a `.agentform/` directory unexpectedly appears**: both commands create `.agentform/state.db` on first run (SQLite's default behavior for a database file that doesn't exist yet) — this is expected, not an error; see `docs/state-reference.md`.
- **`agentform compile` exits 13**: the project uses a node/tool type the target adapter has no generator for — the diagnostic names the specific feature and target. See `docs/compiler-reference.md`'s tables for what each adapter currently supports.
- **`agentform test` exits 9**: either a dataset test case failed one of its assertions (named in the console/`--junit` output), a recognized threshold gate failed, or the dataset itself failed to load (a missing file, invalid JSON/YAML/JSONL, or a test case that doesn't match the schema) — the error message names which. See `docs/evaluation-reference.md`.
- **`agentform test --live` refuses to run**: expected — there is no live-provider execution engine yet. Remove `--live` to run the deterministic mock suite.
- **`agentform plan` shows an `AGF6001`/`AGF6002`/`AGF6003` warning**: your production specification declares evaluation datasets or thresholds, but `agentform test` has never run for the current specification, ran against an earlier version of it, or last failed, respectively. Run (or re-run) `agentform test`. These are warnings on `plan`, but the same conditions genuinely block `agentform apply` at evaluation-failure severity once smoke tests actually run — see `docs/evaluation-reference.md`.
- **Generated code throws/raises the moment you run it**: expected — Agentform generates a project's interface (agents, tools, graph wiring), never its business logic. See the `TODO` in the specific file the error names.
- **`agentform apply` exits 10 with "the saved plan is stale"**: the specification or deployed state changed since the `.afplan` file was created (`agentform plan --out`). Run `agentform plan` again and retry with the fresh file, or run `agentform apply` with no plan file argument to always compute fresh.
- **`agentform apply`/`agentform rollback`/`agentform destroy` exits 11**: another `agentform` process holds `.agentform/lock` (or a stale one within the last `staleTimeoutMs`, default 10 minutes) — the error message names the holder and when it acquired the lock. Wait for it to finish, or retry once the timeout passes. See `docs/state-reference.md`.
- **`agentform apply` exits 7 for a change you didn't expect to be CRITICAL**: check `docs/planner-reference.md`'s risk classification section — the same rules `agentform plan` uses decide this for `apply` too (deleting a workflow, or a workflow with an ungated destructive-tool call). Re-run with `--auto-approve` (this never bypasses policy) or from an interactive terminal to confirm.
- **`agentform drift` reports nothing changed, but you know something did**: `drift` only checks four specific things (resource, environment, adapter-version, artifact drift — see the `agentform drift` section above); it cannot detect a live deployment changed out-of-band, since no adapter can inspect one yet. If you expected resource drift specifically, confirm the specification file `drift` is reading is actually the one that changed (`--environment`/`--cwd`).
- **`agentform rollback` exits 15 with "nothing to roll back to"**: no apply has ever succeeded with a recorded backup in this project's history yet — there's nothing for rollback to restore to. Run `agentform apply` first.
- **`agentform rollback --to <id>` exits 15 with an unknown identifier**: apply-history IDs are UUIDs assigned at apply time, not sequential numbers — get the real ID from `agentform status` (its "Last apply" line) or by inspecting `.agentform/state.db` directly; there's no CLI command yet that lists full history.
- **`agentform destroy --plan` reports "Nothing to destroy"**: no resources are currently tracked in state — either nothing has been applied yet, or a previous `destroy` already ran. Not an error.
- **`agentform import` exits 14 with "no supported project was recognized"**: `import`'s recognition is deliberately limited (§15.12) — it currently only recognizes a generated Agentform project, a raw OpenAI Agents SDK project (via `@openai/agents`/`agents` imports), or a raw LangGraph project (via `langgraph`/`StateGraph`). A different framework, or source code that doesn't match the recognized patterns closely enough, isn't a bug — it's the honestly-reported limit of what this phase implements.
- **`agentform import`'s candidate specification doesn't pass `agentform validate`**: expected for anything beyond the simplest recognized project — check the printed "Manual follow-up required" list for exactly what still needs filling in (tool handlers, workflow wiring, model provider verification are the most common). `import` never promises the output is valid, only that it's a reviewed starting point.
