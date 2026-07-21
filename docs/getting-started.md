# Getting started

## Purpose

This is the first-time path through Agentform: install the toolchain, scaffold a project, and run it through `validate` → `plan` → `apply` → `status`. It is deliberately short — every command below has a full flag/exit-code/output reference in `docs/cli-reference.md`, and the packages doing the work underneath each command are described in `docs/architecture.md`. Read this once to get a working project, then use those two documents (plus `docs/troubleshooting.md` if something goes wrong) as reference material.

## Prerequisites

Agentform requires Node.js ≥ 22 and [pnpm](https://pnpm.io) 10 (the repository pins `pnpm@10.22.0` via `packageManager` in the root `package.json`). It is a pnpm-workspace monorepo, so pnpm — not plain `npm`/`yarn` — is what resolves the `workspace:*` dependencies between `apps/cli` and the `packages/*` it depends on.

## Installing Agentform

Agentform has not published a package yet — `v0.1.0` is still in preparation, and `apps/cli`'s own `package.json` is marked `private`. Today, the only supported way to run the CLI is from a clone of the repository:

```bash
git clone https://github.com/YASSERRMD/AgentForm.git
cd AgentForm
pnpm install
pnpm build
pnpm agentform --help
```

`pnpm build` runs a Turborepo-orchestrated `tsc` build across every package (cached, so repeat builds after a small change are fast); `pnpm agentform` is a root-level script (`"agentform": "node ./apps/cli/dist/index.js"`) that runs the built CLI. Because it is a plain pnpm script, it only resolves from inside the workspace — run every command below from the `AgentForm` checkout root, and use the global `--cwd <path>` flag to point at the project you're actually working on, rather than `cd`-ing out of the workspace. (`docs/cli-reference.md`'s Global options table covers `--cwd` and every other flag every command accepts, such as `--json` and `--quiet`.)

## Scaffolding a project

`agentform init [name]` writes a starter project from one of five templates:

| id                     | What it demonstrates                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `basic` (default)      | One model, one agent, no tools — the smallest valid project.                                                                   |
| `tool-agent`           | An agent with one MCP tool it's explicitly granted.                                                                            |
| `multi-agent`          | A researcher + writer agent pair with a bounded (`maxIterations`) review loop.                                                 |
| `human-approval`       | A low-confidence-routes-to-approval pattern before a write-capable tool runs.                                                  |
| `government-complaint` | The full canonical regulated-government example — `file`/`schemaRef` references, data-residency labels, evaluation thresholds. |

```bash
pnpm agentform init my-project --template basic
```

With a `[name]` argument, `init` creates `my-project` as a new subdirectory of `--cwd` (the workspace root, by default) rather than writing into the current directory. Every later command then needs `--cwd my-project` to operate on it, for example `pnpm agentform --cwd my-project validate`. `init` refuses to run if an `agentform.yaml`/`.yml`/`.json` already exists at the target path, so it never silently overwrites an existing project.

Two of the five templates — `human-approval` and `government-complaint` — reference a real external API via `${env.*}` and will not pass validation until the environment variable(s) listed in their generated `.env.example`/`README.md` are set; this is intentional (a template shouldn't look "ready" while pointed at a fake placeholder URL). `basic`, `tool-agent`, and `multi-agent` validate immediately with no further setup. Running `init` with no TTY attached (scripted/CI usage) or with `--non-interactive` skips all prompts and falls back to defaults (`basic` template, the target directory's basename as the project name).

## Validating the project

```bash
pnpm agentform --cwd my-project validate
```

`validate` runs the full pipeline — parsing, schema validation, semantic validation, then the 15 built-in policies — and prints every diagnostic it collects along the way, not just the first. A clean run prints `Validation succeeded.` and exits `0`. `--strict` additionally fails on warnings (including policy warnings); `--environment <name>` applies an `environments/<name>.yaml` overlay first, if the project defines one. See `docs/schema-reference.md`, `docs/ir-reference.md`, and `docs/policy-reference.md` for what each stage actually checks, and `docs/cli-reference.md` for the full `validate` section.

## Planning changes

```bash
pnpm agentform --cwd my-project plan
```

`plan` compares the specification against Agentform's local record of what's actually deployed, without changing either. The first `plan` (or `status`) run against a project creates `.agentform/state.db` — a per-project SQLite file that starts out empty, so a first plan shows everything as a pending create. Output is a `+`/`~`/`!`/`-` prefixed line per changed resource, then a summary line (`Plan: N to create, N to change, N to destroy.`). Nothing is written to state by this command — see `docs/planner-reference.md` and `docs/state-reference.md` for exactly what's compared and how risk is classified.

## Applying

```bash
pnpm agentform --cwd my-project apply
```

`apply` is the command that actually does something: it recomputes the plan fresh, re-runs policy, generates a real project for the specification's `runtime.target` framework under `generated/<target>/`, runs any declared evaluation datasets as smoke tests, and persists the result into `.agentform/state.db`. A change classified `CRITICAL` risk (for example, deleting a workflow) pauses for interactive confirmation unless `--auto-approve` is given — policy checks are never skipped, even with `--auto-approve`. A newly-scaffolded project with no prior state applies cleanly the first time; re-running `apply` with nothing changed is a no-op. The full 11-step sequence is documented in ADR-0012 and `docs/cli-reference.md`'s `agentform apply` section.

## Checking status

```bash
pnpm agentform --cwd my-project status
```

`status` is a fast, read-only summary: application metadata, deployed resource counts, policy status, evaluation gate status, and cached drift status (`unknown` until you run `agentform drift`). It always exits `0` once the project itself loads successfully — it's a reporting command, not a pass/fail gate.

## Where to go next

- `docs/cli-reference.md` — every command's full flags, exit codes, and `--json` output shape, including the commands this walkthrough skipped (`format`, `inspect`, `graph`, `compile`, `test`, `drift`, `rollback`, `destroy`, `import`, `lockfile`).
- `docs/architecture.md` — how the packages behind these commands fit together and why the pipeline is ordered the way it is.
- `docs/troubleshooting.md` — what to check when a command fails or exits with a code you didn't expect.
- `docs/migration-guide.md` — versioning policy for the specification format, and how to bring an existing OpenAI Agents SDK or LangGraph project into Agentform with `agentform import`.
