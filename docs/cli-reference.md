# Agentform CLI reference

## Purpose

`agentform` is the user-facing entry point to the pipeline documented across `docs/{schema,parser,ir,policy}-reference.md`: `init` scaffolds a project, `validate`/`inspect`/`graph` all run the same `loadProject → buildIR` pipeline (`apps/cli/src/lib/pipeline.ts`) and differ only in what they do with a successful result, and `format` normalizes source file style independently of that pipeline. `validate` additionally runs `@agentform/policy`'s built-in policy pack once the pipeline itself succeeds — see its own section below.

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

| Code | Meaning                     | Where it comes from                                                                                                                                                                         |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success                     |                                                                                                                                                                                             |
| 1    | General failure             | e.g. `format --check` finding an unformatted file; a file that can't be read                                                                                                                |
| 2    | Invalid command usage       | Unknown flag/command/argument (remapped from Commander's own default of `1` — see ADR-0006), an unknown `--format`/`--template`/`--target` value, an `inspect` address that doesn't resolve |
| 3    | Source parsing failure      | Any `AGF1xxx` error from `@agentform/parser`                                                                                                                                                |
| 4    | Schema validation failure   | Any `AGF2xxx` error from `@agentform/schema`                                                                                                                                                |
| 5    | Semantic validation failure | Any `AGF3xxx` error from `@agentform/ir`                                                                                                                                                    |
| 6    | Policy failure              | Any built-in policy ID (`AF001`-`AF015`) reported as `fail`, or an `AGF4xxx` policy-configuration problem (e.g. a rejected mandatory-policy override) — `@agentform/policy`, `validate` only |

`lib/exit-codes.ts`'s `exitCodeForDiagnostics()` picks the code for the _earliest_ pipeline stage with an error, since that's the one whose fix actually unblocks the rest — a document that fails parsing produces exit 3 even if, hypothetically, it would also have failed schema validation (or policy checks, which don't even run until parsing/schema/semantic validation all succeed).

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

A mandatory policy's severity can never be overridden (attempting to produces an `AGF4001` diagnostic and the override is ignored); a non-mandatory override that *weakens* severity requires a non-empty `justification` (`AGF4002` otherwise). There is no CLI flag to point at a different config file or to skip policy checks entirely — see the Security implications section below for why.

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

## Security implications

- `init`/`format` are the only commands that write to disk, and both are conservative: `init` refuses to overwrite an existing entry file; `format` only ever rewrites the exact file it was asked to format (never walks the project writing to files the user didn't name or that weren't already the discovered entry file).
- No command executes generated or user-supplied code — `graph`'s Mermaid/DOT/JSON output is text generation from the already-validated IR, not template execution.
- Diagnostics never include secret values — they come from `@agentform/parser`/`@agentform/schema`/`@agentform/ir`/`@agentform/policy`, none of which read or echo secret material (§3.5, §18); a policy message that names a detected secret runs it through `redactSecretValue` first.
- **Mandatory policies cannot be bypassed with CLI flags** (§16's own acceptance criterion): there is no `--no-policy`/`--skip-policy` flag, no way to pass overrides inline on the command line, and no flag to point `agentform.policy.yaml` at a different file. The *only* lever is the fixed-filename config file, and even that file cannot change a mandatory policy's severity — `evaluatePolicies` rejects the attempt regardless of what the config says.

## Troubleshooting

- **A command hangs with no output**: you're very likely in `init`'s interactive path with stdin that isn't actually connected to a terminal (e.g. running inside some non-interactive wrapper that still reports `isTTY: true`). Pass `--non-interactive` explicitly.
- **`agentform format` "fixes" something you didn't expect**: check whether the file is JSON or YAML — JSON files are never rewritten into YAML syntax, and YAML files never get their keys reordered, only their whitespace/quote style normalized.
- **Exit code 2 for what looks like a real validation problem**: 2 is reserved for _usage_ errors (a bad flag, an unknown `inspect` address, an unknown `--template`) — a genuine document problem always exits 3/4/5/6, never 2.
- **An override in `agentform.policy.yaml` doesn't seem to apply**: check for an `AGF4001`/`AGF4002` diagnostic in the output — a mandatory policy's severity can't be overridden at all, and a non-mandatory *downgrade* (e.g. `error` to `warning`) needs a non-empty `justification` or it's rejected and the default severity is kept.
- **`agentform validate` exits 6 but you expected 0**: a policy fired at `error` severity. The diagnostic's `code` is the policy ID (e.g. `AF003`) — check `docs/policy-reference.md` for what that policy checks and how to fix the underlying document, or (if it's genuinely not mandatory and you have a real reason) add a justified override.
