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

Through Phase 11, the repository has: the monorepo/CI foundation (Phase 1); the `v1alpha1` specification schema (Phase 2); the source parser — YAML/JSON, `$ref`/variable resolution, multi-file projects (Phase 3); semantic validation and the canonical IR (Phase 4); the first five CLI commands (Phase 5); a built-in policy engine — 15 policies, configurable severity within mandatory-policy bounds, wired into `agentform validate` (Phase 6); a local state engine and planner — a SQLite-backed record of deployed state, dependency-ordered desired/current comparison, risk classification, and tamper-evident plan files, wired into `agentform plan`/`agentform status` (Phase 7); a compiler with all six target framework adapters (Phase 8 built OpenAI Agents SDK and LangGraph; Phase 9 added Microsoft Agent Framework, Google ADK, AutoGen, and CrewAI), wired into `agentform compile`; an evaluation engine — a deterministic, fully offline mock execution runtime, a 16-type structural assertion vocabulary, dataset loading, and threshold gates, wired into `agentform test` and surfaced as advisory diagnostics on `agentform plan`/`agentform status` (Phase 10); and a real apply/drift/rollback/destroy/import engine — atomic, transactional state mutation with pre-mutation backups; drift detection across resource/environment/adapter-version/artifact categories; rollback that restores state without ever erasing audit history; destroy with unconditional confirmation and an honest "cannot be recovered" accounting; and limited, confidence-scored recognition of generated-Agentform/raw-OpenAI-Agents-SDK/raw-LangGraph projects for `agentform import` (Phase 11). Still not implemented: live (real-provider) evaluation, or any adapter actually deploying to/tearing down a real target — those land in later phases. See [`temp/instruction.md`](temp/instruction.md) for the full plan, [`docs/cli-reference.md`](docs/cli-reference.md) for command details, [`docs/compiler-reference.md`](docs/compiler-reference.md) for the compiler and adapters (including the cross-adapter compatibility matrix), [`docs/policy-reference.md`](docs/policy-reference.md) for the policy engine, [`docs/state-reference.md`](docs/state-reference.md)/[`docs/planner-reference.md`](docs/planner-reference.md) for the state engine and planner, and [`docs/evaluation-reference.md`](docs/evaluation-reference.md) for the evaluation engine.

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
```

## Repository layout

```text
agentform/
├── apps/
│   └── cli/                 # @agentform/cli — the `agentform` binary
├── packages/
│   ├── core/                 # shared cross-cutting utilities
│   ├── schema/                # Zod schemas + generated JSON Schema (v1alpha1)
│   ├── parser/                # YAML/JSON source loading, refs, variables
│   ├── diagnostics/           # structured error/warning reporting
│   ├── ir/                    # canonical, framework-neutral intermediate representation
│   ├── planner/                # desired-vs-current state comparison and plans
│   ├── state/                  # deployment state abstractions
│   ├── compiler/               # IR → target framework code generation
│   ├── runtime/                 # offline/mocked execution engine
│   ├── policy/                  # policy engine
│   ├── evaluator/                # structural + dataset-driven evaluation
│   ├── observability/            # OpenTelemetry-compatible tracing hooks
│   ├── plugin-sdk/                # stable plugin interfaces
│   ├── adapter-openai/            # OpenAI Agents SDK adapter
│   ├── adapter-langgraph/         # LangGraph adapter
│   ├── adapter-microsoft/         # Microsoft Agent Framework adapter
│   ├── adapter-google-adk/        # Google ADK adapter
│   ├── adapter-autogen/           # AutoGen adapter
│   ├── adapter-crewai/            # CrewAI adapter
│   ├── state-local/               # SQLite state backend
│   ├── state-postgres/            # PostgreSQL state backend
│   ├── secrets-env/               # environment-variable secret provider
│   ├── test-utils/                # shared test fixtures/helpers
│   └── create-agentform/          # `npm create agentform` scaffolding
└── docs/adr/                      # architecture decision records
```

`core`, `diagnostics`, `schema`, `parser`, `ir`, `policy`, `state`, `state-local`, `planner`, `compiler`, `runtime`, `evaluator`, `plugin-sdk`, and all six `adapter-*` packages have real implementations, and `apps/cli` has fourteen working commands (see [`docs/schema-reference.md`](docs/schema-reference.md), [`docs/parser-reference.md`](docs/parser-reference.md), [`docs/ir-reference.md`](docs/ir-reference.md), [`docs/policy-reference.md`](docs/policy-reference.md), [`docs/state-reference.md`](docs/state-reference.md), [`docs/planner-reference.md`](docs/planner-reference.md), [`docs/compiler-reference.md`](docs/compiler-reference.md), [`docs/evaluation-reference.md`](docs/evaluation-reference.md), and [`docs/cli-reference.md`](docs/cli-reference.md)). Every other package under `packages/` (`observability`, `state-postgres`, `secrets-env`, `test-utils`, `create-agentform`) is still a minimal, buildable skeleton (a package identity export plus one test) — real implementations land phase by phase, following [`temp/instruction.md`](temp/instruction.md).

## Development

Requirements: Node.js ≥ 22, [pnpm](https://pnpm.io) 10.

```bash
pnpm install       # install workspace dependencies
pnpm build          # tsc build for every package (turbo-orchestrated, cached)
pnpm typecheck       # tsc --noEmit for every package
pnpm lint             # ESLint across the workspace
pnpm test              # Vitest for every package
pnpm format             # Prettier --write
pnpm format:check        # Prettier --check
pnpm agentform --help     # run the CLI from the workspace root
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
