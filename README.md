# Agentform

[![CI](https://github.com/YASSERRMD/AgentForm/actions/workflows/ci.yml/badge.svg)](https://github.com/YASSERRMD/AgentForm/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**Agentic Systems as Code.**

Agentform is a declarative control plane for portable agentic systems. It defines, validates, plans, compiles, tests, deploys, and governs agent applications across multiple frameworks.

Agentform is not another agent framework. It is a provider-neutral control plane, specification language, compiler, state engine, policy engine, testing framework, and lifecycle manager that operates above existing agent frameworks — giving agentic AI systems the same declarative, plan-then-apply development experience that infrastructure-as-code tools brought to cloud infrastructure.

> Agentform creates a deterministic control layer around probabilistic AI systems.

Agentform cannot make a language model's output deterministic. What it does provide is **deterministic control around probabilistic execution** — of model identifiers and versions, prompt files, input/output schemas, tool permissions, workflow transitions, retries, timeouts, cost limits, human-approval gates, and policy enforcement.

## Target frameworks

Agentform compiles a single specification into implementation artifacts for:

1. OpenAI Agents SDK
2. LangGraph
3. Microsoft Agent Framework
4. Google Agent Development Kit
5. AutoGen
6. CrewAI
7. Agno

## How it works

```text
YAML or JSON
    ↓
Parsed source document
    ↓
Schema validation
    ↓
Semantic validation
    ↓
Agentform IR
    ↓
Policy analysis
    ↓
Execution plan
    ↓
Target adapter
    ↓
Generated implementation
```

An Agentform specification describes an agentic application's models, tools, agents, workflows, memory, policies, evaluations, and observability in one provider-neutral document. The compiler resolves that specification into a canonical intermediate representation (the **Agentform IR**), then targets it at one or more frameworks — without leaking framework-specific concepts back into the source specification.

## Project status

This repository is in active, phased development. Each phase lands on its own branch and pull request; see [`temp/instruction.md`](temp/instruction.md) for the full build plan.

Through Phase 12, the repository has: the monorepo/CI foundation (Phase 1); the `v1alpha1` specification schema (Phase 2); the source parser — YAML/JSON, `$ref`/variable resolution, multi-file projects (Phase 3); semantic validation and the canonical IR (Phase 4); the first five CLI commands (Phase 5); a built-in policy engine — 15 policies, configurable severity within mandatory-policy bounds, wired into `agentform validate` (Phase 6); a local state engine and planner — a SQLite-backed record of deployed state, dependency-ordered desired/current comparison, risk classification, and tamper-evident plan files, wired into `agentform plan`/`agentform status` (Phase 7); a compiler with all six target framework adapters (Phase 8 built OpenAI Agents SDK and LangGraph; Phase 9 added Microsoft Agent Framework, Google ADK, AutoGen, and CrewAI), wired into `agentform compile`; an evaluation engine — a deterministic, fully offline mock execution runtime, a 16-type structural assertion vocabulary, dataset loading, and threshold gates, wired into `agentform test` and surfaced as advisory diagnostics on `agentform plan`/`agentform status` (Phase 10); a real apply/drift/rollback/destroy/import engine — atomic, transactional state mutation with pre-mutation backups; drift detection across resource/environment/adapter-version/artifact categories; rollback that restores state without ever erasing audit history; destroy with unconditional confirmation and an honest "cannot be recovered" accounting; and limited, confidence-scored recognition of generated-Agentform/raw-OpenAI-Agents-SDK/raw-LangGraph projects for `agentform import` (Phase 11); and a PostgreSQL-backed state option (`@agentform/state-postgres`, selectable via `AGENTFORM_STATE_POSTGRES_URL`), a local module registry with optional Ed25519 signing and a lockfile (`@agentform/registry`, `agentform lockfile`), a browsable documentation site (`apps/docs-site`), and a pipeline benchmarking harness (`apps/benchmarks`) (Phase 12). Post-v1, a seventh target framework adapter was added — `@agentform/adapter-agno` (Agno) — the richest node-type coverage of any adapter after LangGraph, since Agno's own workflow primitives map unusually directly onto Agentform's node vocabulary; see `docs/compiler-reference.md`'s Agno section and ADR-0015. Also post-v1, work began on **Agentform Studio**, a local web GUI layered on top of the same spec/validation pipeline the CLI uses — never a parallel authority, always a view/editor over the same `agentform.yaml`. Phase 13 (foundation) is done: a read-only spec viewer and live diagnostics, served by `apps/studio-server` (Fastify) and rendered by `apps/studio-web` (React + Vite), sharing typed contracts from `packages/studio-core`. Phase 14 (schema-driven forms) is also done: every resource type gets a real edit form generated from its actual Zod schema, and saving now writes back through the full validate → IR → policy pipeline into a real, comment-preserving `agentform.yaml` — Studio's first write path. Phase 15 (canvas) is also done: `workflows` get a real node/edge graph editor (React Flow + dagre auto-layout) covering all 13 node types, with live client-side semantic validation (the real validator, reused via a new browser-safe `@agentform/ir` entry point) and a warning when an edit removes a destructive tool's human-approval gate — the server's validate → policy pipeline remains the sole authority on what actually saves. Phase 16 (form layout + design layer) is also done: a new `packages/studio-design` owns a presentational-only design artifact model (`.afdesign.json`) — an agent's `Fields`/`Layout` toggle lets you arrange fields already declared in its `inputSchema`/`outputSchema` (reorder, group, pick a widget), and the workflow canvas now persists dragged node positions, both saved to a design artifact that structurally cannot alter control flow, permissions, or policy (a separate write path from the spec-patch pipeline entirely). Phase 17 (GenAI) is also done: a new, server-only `packages/studio-genai` proposes new spec resources (prompt-to-spec) and one agent's form layout (prompt-to-design) from a natural-language prompt, using the Anthropic SDK's own structured-output mechanism against the real Zod schemas already used everywhere else — every proposal is preview-only and runs through the exact same validate → policy pipeline its write-path counterpart uses (`validateSpecPatch`, extracted from `applySpecPatch` for this exact purpose) before it can be shown as accepted; accepting one re-submits to the real, already-hardened write endpoints rather than writing anything new. `AGENTFORM_STUDIO_GENAI_PROVIDER` defaults to `anthropic` (needs a real `ANTHROPIC_API_KEY`, read only by the SDK itself) and can be set to `local-demo` for a key-free, network-free stand-in. See `docs/studio-reference.md`, ADR-0016, ADR-0017, ADR-0018, ADR-0019, and ADR-0020. Still not implemented: live (real-provider) evaluation, any adapter actually deploying to/tearing down a real target, multi-file project writes, a freeform/mockup design canvas UI, or Studio's edit-by-chat surface (Phase 18). See [`temp/instruction.md`](temp/instruction.md) for the full plan, [`docs/cli-reference.md`](docs/cli-reference.md) for command details, [`docs/compiler-reference.md`](docs/compiler-reference.md) for the compiler and adapters (including the cross-adapter compatibility matrix), [`docs/policy-reference.md`](docs/policy-reference.md) for the policy engine, [`docs/state-reference.md`](docs/state-reference.md)/[`docs/planner-reference.md`](docs/planner-reference.md) for the state engine and planner, [`docs/evaluation-reference.md`](docs/evaluation-reference.md) for the evaluation engine, and [`docs/registry-reference.md`](docs/registry-reference.md) for the module registry.

The CLI lifecycle:

```bash
agentform init          # scaffold a new project from one of five starter templates
agentform validate      # parse, schema-validate, semantically validate, and policy-check a project
agentform format        # deterministically reformat a YAML/JSON source file
agentform inspect       # print a resolved resource, or an application summary
agentform graph         # generate a Mermaid, DOT, or JSON workflow graph
agentform plan          # compare desired specification against deployed state, no changes made
agentform status        # show application, deployed state, drift, and policy status
agentform compile       # generate a project for any of the six target frameworks from the specification
agentform test          # run evaluation datasets against the deterministic mock execution engine
agentform apply         # generate artifacts, run smoke tests, and persist deployed state atomically
agentform drift         # detect resource/environment/adapter-version/artifact drift, no changes made
agentform rollback      # restore state to a previous apply or snapshot, without erasing audit history
agentform destroy       # tear down every tracked resource, with unconditional confirmation
agentform import        # limited, best-effort recognition of an existing project into a candidate spec
agentform lockfile      # resolve declared modules against the registry and write agentform.lock
```

## Repository layout

```text
agentform/
├── apps/
│   ├── cli/                  # @agentform/cli — the `agentform` binary
│   ├── docs-site/             # manifest-driven static site build for docs/**/*.md
│   ├── benchmarks/             # pipeline timing harness (parse/validate/plan/compile)
│   ├── studio-web/             # Agentform Studio frontend (React + Vite)
│   └── studio-server/          # Agentform Studio backend (Fastify) — spec I/O, diagnostics
├── packages/
│   ├── core/                 # shared cross-cutting utilities
│   ├── schema/                # Zod schemas + generated JSON Schema (v1alpha1)
│   ├── parser/                # YAML/JSON source loading, refs, variables
│   ├── diagnostics/           # structured error/warning reporting
│   ├── ir/                    # canonical, framework-neutral intermediate representation
│   ├── planner/                # desired-vs-current state comparison and plans
│   ├── state/                  # deployment state abstractions
│   ├── registry/                # module registry: local store, signing, resolution, lockfile
│   ├── compiler/               # IR → target framework code generation
│   ├── runtime/                 # offline/mocked execution engine
│   ├── policy/                  # policy engine
│   ├── evaluator/                # structural + dataset-driven evaluation
│   ├── observability/            # OpenTelemetry-compatible tracing hooks
│   ├── plugin-sdk/                # stable plugin interfaces
│   ├── studio-core/                # Studio's shared spec/diagnostics model, HTTP contracts, patch engine
│   ├── studio-design/               # Studio's design artifact model (form layout, canvas positions), validation, render target
│   ├── studio-genai/                # Studio's provider-neutral GenAI generation (prompt-to-spec, prompt-to-design), server-only
│   ├── adapter-openai/            # OpenAI Agents SDK adapter
│   ├── adapter-langgraph/         # LangGraph adapter
│   ├── adapter-microsoft/         # Microsoft Agent Framework adapter
│   ├── adapter-google-adk/        # Google ADK adapter
│   ├── adapter-autogen/           # AutoGen adapter
│   ├── adapter-crewai/            # CrewAI adapter
│   ├── adapter-agno/              # Agno adapter
│   ├── state-local/               # SQLite state backend
│   ├── state-postgres/            # PostgreSQL state backend
│   ├── secrets-env/               # environment-variable secret provider
│   ├── test-utils/                # shared test fixtures/helpers
│   └── create-agentform/          # `npm create agentform` scaffolding
├── examples/                      # complete, validating example projects
├── scripts/                       # release-support tooling (e.g. SBOM generation)
└── docs/adr/                      # architecture decision records
```

`core`, `diagnostics`, `schema`, `parser`, `ir`, `policy`, `state`, `state-local`, `state-postgres`, `registry`, `planner`, `compiler`, `runtime`, `evaluator`, `plugin-sdk`, `studio-core`, `studio-design`, `studio-genai`, and all seven `adapter-*` packages have real implementations, and `apps/cli` has fifteen working commands (see [`docs/schema-reference.md`](docs/schema-reference.md), [`docs/parser-reference.md`](docs/parser-reference.md), [`docs/ir-reference.md`](docs/ir-reference.md), [`docs/policy-reference.md`](docs/policy-reference.md), [`docs/state-reference.md`](docs/state-reference.md), [`docs/planner-reference.md`](docs/planner-reference.md), [`docs/compiler-reference.md`](docs/compiler-reference.md), [`docs/evaluation-reference.md`](docs/evaluation-reference.md), [`docs/registry-reference.md`](docs/registry-reference.md), and [`docs/cli-reference.md`](docs/cli-reference.md)). `observability`, `secrets-env`, `test-utils`, and `create-agentform` are still minimal, buildable skeletons (a package identity export plus one test) — real implementations land phase by phase, following [`temp/instruction.md`](temp/instruction.md).

## Development

Requirements: Node.js ≥ 22, [pnpm](https://pnpm.io) 10.

```bash
pnpm install         # install workspace dependencies
pnpm build            # tsc build for every package (turbo-orchestrated, cached)
pnpm typecheck         # tsc --noEmit for every package
pnpm lint               # ESLint across the workspace
pnpm test                # Vitest for every package
pnpm test:integration     # @agentform/state-postgres tests against a real PostgreSQL instance
pnpm test:e2e               # @agentform/cli tests (spawns the real built binary)
pnpm format                   # Prettier --write
pnpm format:check              # Prettier --check
pnpm docs:build                  # render docs/**/*.md into apps/docs-site/dist/
pnpm benchmark                     # time parse/validate/plan/compile against synthetic projects
pnpm sbom                            # generate a CycloneDX-shaped sbom.json
pnpm agentform --help                 # run the CLI from the workspace root
```

`test:integration` requires a reachable PostgreSQL instance (`AGENTFORM_TEST_POSTGRES_URL`, default `postgresql://postgres:postgres@localhost:5432/agentform_test`) — CI provides one as a service container; locally, point it at any disposable PostgreSQL 16+ database.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
