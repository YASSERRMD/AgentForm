# Architecture

## Purpose

This is a bird's-eye view of how Agentform's packages compose — which package hands its output to which, and why the pipeline is ordered the way it is. It intentionally does not re-explain any package's internals; each package with a real implementation has its own `docs/*-reference.md` (schema, parser, ir, policy, state, planner, compiler, evaluation) covering its behavior, scope, and troubleshooting in depth, and every non-trivial design decision has an ADR under `docs/adr/`. Read this page to understand how a specification document turns into a running (or planned, or compiled, or tested) system; read the linked reference docs for what a specific stage actually does.

## The specification pipeline

A project's source of truth is one or more YAML/JSON files (`agentform.yaml` plus, optionally, auto-discovered `agents/`, `tools/`, `workflows/` directories and an `environments/<name>.yaml` overlay — `docs/parser-reference.md`). Every diagnostics-producing CLI command runs the same sequence to turn that source into a validated, canonical in-memory representation (`apps/cli/src/lib/pipeline.ts`'s `loadAndBuildIR`):

```text
source YAML/JSON
     │
     ▼
@agentform/parser     loadProject — YAML/JSON parsing with source locations, $ref/file/schemaRef
                       resolution, multi-file auto-discovery, environment overlay merge,
                       ${env.*}/${var.*}/${local.*} interpolation
     │
     ▼
@agentform/registry    resolveProjectModules — resolves each spec.modules entry against a local
                        module registry and merges its resources into spec.{models,tools,agents,
                        workflows,memory}, so a module-provided resource is validated exactly like
                        an inline one. Runs only when spec.modules is present; a no-op otherwise.
     │
     ▼
@agentform/schema      validateAgenticApplication — Zod shape/type validation against the
                        v1alpha1 schema (AGF2xxx diagnostics)
     │
     ▼
@agentform/ir          buildIR — cross-resource semantic checks (AGF3xxx): unknown references,
                        workflow graph reachability/cycles/terminal paths, then compiles the
                        document into the canonical AgentformIR (Map-keyed resources, resolved
                        defaults, a deterministic content hash)
     │
     ▼
@agentform/policy      evaluatePolicies — 15 built-in policies (AF001-AF015) checked against the
                        schema-validated document once parsing/schema/semantic validation succeed
```

Module resolution sits between the parser and schema validation deliberately, even though it is logically a separate concern from either: a module's agents/tools/workflows need to reach `@agentform/schema` and `@agentform/ir` through the same path an inline-declared resource does, never a separate, weaker one. A module that fails to resolve (not published in the registry, a content hash that no longer matches — tamper detection — or a definition that fails its own schema check) contributes an error diagnostic in the `AGF7xxx` range and is skipped, but does not stop the rest of the document from being validated, the same "collect everything, don't stop at the first problem" discipline every other stage follows. `spec.modules` itself is schema-validated (`packages/schema/src/module.ts`) as a well-formed _reference_ (`source`, `version`, optional `inputs`); actually fetching and merging what it points to is `@agentform/registry`'s job, not the schema's.

Parsing failures stop the pipeline immediately (schema/semantic validation over a document that didn't even parse would just produce confusing secondary diagnostics); every later stage runs against and accumulates diagnostics from whatever the earlier stages produced. `agentform validate`/`inspect`/`graph`/`plan`/`status`/`compile`/`test`/`apply`/`drift`/`lockfile` all run this same pipeline and differ only in what they do with a successful result — see `docs/cli-reference.md`.

## Two directions after validation

Once a specification produces a valid `AgentformIR`, Agentform can do one of two structurally different things with it:

**Generate real framework code.** `@agentform/compiler` orchestrates one `FrameworkAdapter` (the interface `@agentform/plugin-sdk` defines) per target framework, turning the IR into a real project — source files, a dependency manifest, a `manifest.json` recording the IR hash the project was generated from. This path is stateless: `agentform compile` can be run repeatedly and never reads or writes anything about what's currently deployed. Six adapter packages implement `FrameworkAdapter` today (`adapter-openai`, `adapter-langgraph`, `adapter-microsoft`, `adapter-google-adk`, `adapter-autogen`, `adapter-crewai`) — see `docs/compiler-reference.md` for the cross-adapter compatibility matrix, since no adapter supports every workflow node type.

**Plan and apply against tracked deployed state.** `@agentform/planner` compares the desired IR against `ResourceState`s read from a `StateBackend` (`@agentform/state`'s backend-agnostic interface), producing a risk-classified list of creates/updates/replaces/deletes — the same comparison Terraform's `plan` makes between configuration and state. `@agentform/state-local` (SQLite, under a project's `.agentform/` directory) is the default backend; `@agentform/state-postgres` is a second, remote-capable implementation of the same interface, selected instead of the local backend by setting `AGENTFORM_STATE_POSTGRES_URL` (`apps/cli/src/lib/state.ts`) — a project's specification has no field for this, since state _storage_ is a deployment concern, not something the portable specification should encode. `agentform plan`/`status` read state; `agentform apply`/`rollback`/`destroy` are the only commands that mutate it, each transactionally and behind a pre-mutation backup (ADR-0012, ADR-0013, `docs/state-reference.md`, `docs/planner-reference.md`). `agentform apply` itself calls into the compilation path as one of its steps — generating artifacts the same way `compile` does — before persisting the new state, which is why compilation and state management are described as two directions rather than two disconnected features.

`agentform drift` layers on top of the state path: it re-runs the same desired-vs-state comparison `plan` does (resource drift), plus three more checks with no planner/compiler equivalent — declared vs. last-applied environment, installed vs. recorded adapter version, and on-disk artifact hash vs. current IR hash (ADR-0012).

## Testing the pipeline

`@agentform/runtime` and `@agentform/evaluator` implement a deterministic, fully offline execution engine: given the IR and a dataset of test cases, it walks the real workflow graph node by node but never calls a real model, tool, or API — every effect comes from the test case's own declared mocks. `@agentform/evaluator` then checks a 16-type structural assertion vocabulary against what happened, and gates on up to three declared thresholds (`taskSuccess`, `policyViolations`, `maximumAverageCostUsd`). This is invoked in exactly two places: directly by `agentform test`, and as one step inside `agentform apply`'s 11-step sequence (smoke tests run after artifact generation, before state is persisted). It is not part of `agentform compile`, which never executes anything it generates. See `docs/evaluation-reference.md`.

## Package groups

`packages/` currently holds 25 packages; `apps/cli` (the `agentform` binary, the only current caller of everything above) and `apps/docs-site` (a static site build rendering `docs/**/*.md`) round out the workspace. Grouped by role in the pipeline above, rather than alphabetically:

**Cross-cutting foundations** — `core` (shared utilities: safe path resolution, content hashing, duration parsing) and `diagnostics` (the structured error/warning code definitions every stage reports through) have no pipeline position of their own; every other package depends on one or both.

**Specification pipeline** — `schema` (Zod `v1alpha1` schema plus generated JSON Schema), `parser` (source loading and resolution), `registry` (external module resolution, signing, lockfiles), `ir` (semantic validation, canonical IR, content hashing).

**Governance** — `policy` (the 15 built-in policies).

**Compilation path** — `compiler` (adapter orchestration), `plugin-sdk` (the `FrameworkAdapter` interface every adapter and the compiler share), and the six `adapter-*` packages.

**Deployment-state path** — `planner` (desired-vs-state comparison and risk classification), `state` (the backend-agnostic interface and data shapes), `state-local` (the SQLite implementation), `state-postgres` (the PostgreSQL implementation).

**Evaluation** — `runtime` (the deterministic mock execution engine), `evaluator` (assertions, dataset loading, threshold gates).

**Still-minimal** — `observability`, `secrets-env`, `test-utils`, and `create-agentform` currently each ship only a package identity export and a placeholder test; they exist as reserved extension points (OpenTelemetry-compatible tracing hooks, an environment-variable secret provider, shared test fixtures, and `npm create agentform`-style scaffolding, respectively) with no behavior yet.

## Where to go deeper

Each pipeline stage's own reference doc covers its minimal API example, full scope (including what it deliberately does not do), and a troubleshooting section: `docs/schema-reference.md`, `docs/parser-reference.md`, `docs/ir-reference.md`, `docs/policy-reference.md`, `docs/state-reference.md`, `docs/planner-reference.md`, `docs/compiler-reference.md`, `docs/evaluation-reference.md`. `docs/cli-reference.md` covers every command built on top of this pipeline, including exit codes and `--json` shapes. `docs/security/threat-model.md` covers the cross-package security posture (what's validated where, what's never trusted, what tampering is detected and how). Design rationale for anything described here — why module resolution runs before schema validation, why state storage is an environment variable rather than a spec field, why drift is checked as four separate things instead of one boolean — lives in `docs/adr/`, one file per decision.
