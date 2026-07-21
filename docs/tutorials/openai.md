# OpenAI Agents SDK tutorial

## Overview

The OpenAI Agents SDK (`@openai/agents`) is a TypeScript SDK for building agents with model calls, tool use, and agent-to-agent handoffs. `@agentform/adapter-openai` is Agentform's adapter for it — its manifest (`packages/adapter-openai/src/adapter.ts`, `OPENAI_ADAPTER_MANIFEST.capabilities`) declares `agent`, `tool`, `handoff`, `structured-output`, `guardrails`, and `basic-multi-agent-workflow`. That last capability name is literal: this adapter targets a well-scoped basic multi-agent workflow (agents, tools, and handoffs between agents), not full workflow-graph fidelity — see "What this adapter does not generate" below.

## Scaffold and compile

`openai` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`, and also the CLI's default target when `--target` is omitted):

```bash
agentform init my-assistant --target openai --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent — the smallest valid Agentform project (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` (defaulting `--target` to the project's declared `spec.runtime.target`, here `openai`) runs `openAiAdapter.generate()` (`packages/adapter-openai/src/adapter.ts`) and writes:

```text
generated/openai/
├── manifest.json
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
└── src/
    ├── agents/
    │   └── assistant.ts
    ├── workflows/
    │   ├── main.ts
    │   └── index.ts
    ├── observability/
    │   └── tracing.ts
    └── index.ts
```

No `src/tools/` or `src/policies/guardrails.ts` here — the basic template declares no tools and no agent-level `guardrails`, and both are only generated when the specification actually uses them (`generate()`'s per-tool loop; `generateGuardrailsFile` returns `undefined` when no agent references a guardrail name). `src/agents/assistant.ts` becomes `new Agent({ name: "assistant", instructions: "...", model: "gpt-5", ... })` (`@openai/agents`'s real `Agent` class); `src/workflows/main.ts` becomes a `runWorkflow(input)` function that calls the SDK's `run(entrypointAgent, input)`. The human-readable console output names the same file count `generate()` actually produced (`apps/cli/src/commands/compile.ts`):

```text
Target: openai
  Wrote 9 files to /path/to/my-assistant/generated/openai
```

(`manifest.json` is written separately by the CLI itself, alongside those 9 — see [docs/compiler-reference.md](../compiler-reference.md)'s `GeneratedManifest` section — so it isn't counted in `filesWritten`.)

## Running the generated project

`src/agents/assistant.ts` and every generated tool's `execute` body are throwing stubs — Agentform generates the project's interface, never its business logic — so `npm run build` succeeds but running the workflow immediately throws until you fill those in. Per the generated `README.md` and `generatePackageJson`/`generateEnvExample` (`packages/adapter-openai/src/generate-project-files.ts`):

```bash
npm install
cp .env.example .env   # then fill in OPENAI_API_KEY
npm run build
npm start
```

`package.json` pins `@openai/agents@0.13.5` and `zod@4.4.3` as real dependencies (plus `typescript@7.0.2`/`@types/node@24.11.1` as dev dependencies — exact versions, never a `^`/`~` range, per `packages/adapter-openai/src/versions.ts`), and `.env.example` documents only `OPENAI_API_KEY`, since that's what the SDK's own OpenAI client reads automatically — nothing in generated code hardcodes a credential value.

## What this adapter does not generate

Only `agent`, `tool`, and `terminate` workflow node types are supported (`SUPPORTED_NODE_TYPES` in `packages/adapter-openai/src/compatibility.ts`); every other node type — `router`, `loop`, `humanApproval`, `parallel`, `join`, `delay`, `event`, `subworkflow`, `transform`, `condition` — is `unsupported` and blocks compilation for this target. A specification using, say, a `router` node against `--target openai` fails with a blocking `AGF5001` diagnostic naming the exact node:

```text
Error [AGF5001] [openai] workflow node (router) is unsupported: "router" nodes are beyond this adapter's basic multi-agent workflow support (at workflow.main.nodes.route)
```

Agent-to-agent delegation (`agent.delegation.allowedAgents`) is unaffected by this — it maps directly onto the SDK's real `handoffs` option, independent of the workflow node-graph. Separately, `sessions`, `tracing hooks`, and `tool restrictions` are reported `partial` (real SDK features this adapter doesn't generate configuration for yet) rather than silently claimed as supported — these are warnings, not blocking.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
