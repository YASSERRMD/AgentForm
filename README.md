<p align="center">
  <img src="assets/logo.png" alt="Agentform" width="140" />
</p>

<h1 align="center">Agentform</h1>

<p align="center"><strong>Agentic Systems as Code.</strong></p>

<p align="center">
  <a href="https://github.com/YASSERRMD/AgentForm/actions/workflows/ci.yml"><img src="https://github.com/YASSERRMD/AgentForm/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache-2.0" /></a>
</p>

Agentform is a declarative control plane for portable agentic systems. It defines, validates, plans, compiles, tests, deploys, and governs agent applications across multiple frameworks — the same declarative, plan-then-apply development experience that infrastructure-as-code tools brought to cloud infrastructure, applied to agentic AI.

Agentform is not another agent framework. It's a provider-neutral specification language, compiler, state engine, policy engine, and testing framework that operates _above_ existing agent frameworks, without leaking framework-specific concepts back into the source specification.

> Agentform creates a deterministic control layer around probabilistic AI systems.

Agentform cannot make a language model's output deterministic. What it does provide is **deterministic control around probabilistic execution** — of model identifiers and versions, prompt files, input/output schemas, tool permissions, workflow transitions, retries, timeouts, cost limits, human-approval gates, and policy enforcement.

## Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="Agentform architecture: a single agentform.yaml specification flows through validation (Parser, Schema, IR, Policy), then either compiles to seven target frameworks or plans and applies against tracked state, with a deterministic offline evaluation engine cross-cutting both paths. Agentform Studio is a visual editor over the same spec file." width="100%" />
</p>

One specification, validated once, driven in two directions: **compile** it into real framework code for any of seven targets, or **plan and apply** it against tracked deployed state. A deterministic, fully offline evaluation engine tests either path without ever calling a real model or provider. [Agentform Studio](docs/studio-reference.md) is a second, visual interface onto the same `agentform.yaml` — never a parallel source of truth.

## Quickstart

Requirements: Node.js ≥ 22, [pnpm](https://pnpm.io) 10.

```bash
pnpm install
pnpm agentform init          # scaffold a new project from one of five starter templates
pnpm agentform validate      # parse, schema-validate, semantically validate, and policy-check it
pnpm agentform plan          # compare desired specification against deployed state
pnpm agentform compile       # generate a real project for any of the seven target frameworks
pnpm agentform test          # run evaluation datasets against the deterministic mock engine
pnpm agentform apply         # generate artifacts, run smoke tests, persist deployed state atomically
```

The full command reference, including `status`, `drift`, `rollback`, `destroy`, `import`, and `lockfile`, lives in [`docs/cli-reference.md`](docs/cli-reference.md).

## Target frameworks

Agentform compiles a single specification into implementation artifacts for:

| Framework                    | Package                         |
| ---------------------------- | ------------------------------- |
| OpenAI Agents SDK            | `@agentform/adapter-openai`     |
| LangGraph                    | `@agentform/adapter-langgraph`  |
| Microsoft Agent Framework    | `@agentform/adapter-microsoft`  |
| Google Agent Development Kit | `@agentform/adapter-google-adk` |
| AutoGen                      | `@agentform/adapter-autogen`    |
| CrewAI                       | `@agentform/adapter-crewai`     |
| Agno                         | `@agentform/adapter-agno`       |

No adapter supports every workflow node type — see [`docs/compiler-reference.md`](docs/compiler-reference.md) for the cross-adapter compatibility matrix.

## Documentation

| Topic                                   | Doc                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| How the pipeline composes end to end    | [`docs/architecture.md`](docs/architecture.md)                                                                 |
| Specification schema                    | [`docs/schema-reference.md`](docs/schema-reference.md)                                                         |
| Parser (YAML/JSON, refs, variables)     | [`docs/parser-reference.md`](docs/parser-reference.md)                                                         |
| Canonical IR                            | [`docs/ir-reference.md`](docs/ir-reference.md)                                                                 |
| Policy engine (15 built-in policies)    | [`docs/policy-reference.md`](docs/policy-reference.md)                                                         |
| State engine + planner                  | [`docs/state-reference.md`](docs/state-reference.md), [`docs/planner-reference.md`](docs/planner-reference.md) |
| Compiler + framework adapters           | [`docs/compiler-reference.md`](docs/compiler-reference.md)                                                     |
| Evaluation engine                       | [`docs/evaluation-reference.md`](docs/evaluation-reference.md)                                                 |
| Module registry                         | [`docs/registry-reference.md`](docs/registry-reference.md)                                                     |
| Agentform Studio (local web GUI)        | [`docs/studio-reference.md`](docs/studio-reference.md)                                                         |
| CLI command reference                   | [`docs/cli-reference.md`](docs/cli-reference.md)                                                               |
| Security threat model                   | [`docs/security/threat-model.md`](docs/security/threat-model.md)                                               |
| Design decisions, one file per decision | [`docs/adr/`](docs/adr/)                                                                                       |

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

## Development

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

## Project status

The 12-phase core build, a seventh adapter (Agno), the six-phase Agentform Studio arc, and a post-arc security-hardening pass are all complete and merged to `main`. `core`, `diagnostics`, `schema`, `parser`, `ir`, `policy`, `state`, `state-local`, `state-postgres`, `registry`, `planner`, `compiler`, `runtime`, `evaluator`, `plugin-sdk`, `studio-core`, `studio-design`, `studio-genai`, and all seven `adapter-*` packages have real implementations; `apps/cli` has fifteen working commands. `v0.1.0` is release-ready but not yet published.

Still not implemented: live (real-provider) evaluation, any adapter actually deploying to/tearing down a real target, multi-file project writes, or a freeform/mockup design canvas UI.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>
    <img src="assets/my-mark.png" alt="" width="20" />
    &nbsp;Mohamed Yasser&nbsp;·&nbsp;Solutions Architect
  </sub>
</p>
