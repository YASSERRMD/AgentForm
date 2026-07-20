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

Through Phase 8, the repository has: the monorepo/CI foundation (Phase 1); the `v1alpha1` specification schema (Phase 2); the source parser — YAML/JSON, `$ref`/variable resolution, multi-file projects (Phase 3); semantic validation and the canonical IR (Phase 4); the first five CLI commands (Phase 5); a built-in policy engine — 15 policies, configurable severity within mandatory-policy bounds, wired into `agentform validate` (Phase 6); a local state engine and planner — a SQLite-backed record of deployed state, dependency-ordered desired/current comparison, risk classification, and tamper-evident plan files, wired into `agentform plan`/`agentform status` (Phase 7); and a compiler with OpenAI Agents SDK and LangGraph framework adapters, wired into `agentform compile` (Phase 8). Still not implemented: the evaluator, the remaining four framework adapters, or the apply/import/rollback/destroy engine — those land in later phases. See [`temp/instruction.md`](temp/instruction.md) for the full plan, [`docs/cli-reference.md`](docs/cli-reference.md) for command details, [`docs/compiler-reference.md`](docs/compiler-reference.md) for the compiler and adapters, [`docs/policy-reference.md`](docs/policy-reference.md) for the policy engine, and [`docs/state-reference.md`](docs/state-reference.md)/[`docs/planner-reference.md`](docs/planner-reference.md) for the state engine and planner.

The CLI lifecycle — implemented commands first:

```bash
agentform init          # scaffold a new project from one of five starter templates
agentform validate      # parse, schema-validate, semantically validate, and policy-check a project
agentform format        # deterministically reformat a YAML/JSON source file
agentform inspect       # print a resolved resource, or an application summary
agentform graph         # generate a Mermaid, DOT, or JSON workflow graph
agentform plan          # compare desired specification against deployed state, no changes made
agentform status        # show application, deployed state, and policy status
agentform compile       # generate an OpenAI Agents SDK or LangGraph project from the specification

# Not yet implemented — later phases:
agentform test
agentform apply
agentform drift
agentform import
agentform rollback
agentform destroy
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

`core`, `diagnostics`, `schema`, `parser`, `ir`, `policy`, `state`, `state-local`, and `planner` have real implementations, and `apps/cli` has seven working commands (see [`docs/schema-reference.md`](docs/schema-reference.md), [`docs/parser-reference.md`](docs/parser-reference.md), [`docs/ir-reference.md`](docs/ir-reference.md), [`docs/policy-reference.md`](docs/policy-reference.md), [`docs/state-reference.md`](docs/state-reference.md), [`docs/planner-reference.md`](docs/planner-reference.md), and [`docs/cli-reference.md`](docs/cli-reference.md)). Every other package under `packages/` is still a minimal, buildable skeleton (a package identity export plus one test) — real implementations land phase by phase, following [`temp/instruction.md`](temp/instruction.md).

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
