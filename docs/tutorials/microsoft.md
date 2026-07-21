# Microsoft Agent Framework tutorial

## Overview

Microsoft Agent Framework (`Microsoft.Agents.AI`) is a .NET agent framework built around `IChatClient`-backed agents and a workflow-builder layer for composing them. `@agentform/adapter-microsoft` is Agentform's adapter for it — its manifest (`packages/adapter-microsoft/src/adapter.ts`, `MICROSOFT_ADAPTER_MANIFEST.capabilities`) declares `chat-client-agents`, `handoff-workflows`, `sequential-workflows`, and `tool-registration`. This is the only non-TypeScript, non-Python target among the six: generated code is C#, and the generated project is a real `.csproj`, not a `package.json`/`pyproject.toml`.

## Scaffold and compile

`microsoft` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`):

```bash
agentform init my-assistant --target microsoft --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` runs `microsoftAdapter.generate()` (`packages/adapter-microsoft/src/adapter.ts`) and writes:

```text
generated/microsoft/
├── manifest.json
├── MyAssistant.csproj
├── Program.cs
├── .env.example
├── README.md
├── Models/
│   └── PrimaryModel.cs
├── Agents/
│   └── AssistantAgent.cs
└── Workflows/
    └── MainWorkflow.cs
```

Directory and file names are `PascalCase`, matching each generated class name (`toPascalCase`, `@agentform/compiler`) — `PrimaryModel.cs` from the `primary` model, `AssistantAgent.cs` from the `assistant` agent, `MainWorkflow.cs` from the `main` workflow, and the `.csproj` itself named after the application (`my-assistant` → `MyAssistant.csproj`). No `Tools/` directory here, since the basic template declares no tools. `Agents/AssistantAgent.cs` becomes a static class exposing `Build() -> AIAgent`, wrapping the real `IChatClient.AsAIAgent(instructions:, name:, ...)`; because this workflow has only one agent participant, `Workflows/MainWorkflow.cs` exposes a plain `Build() -> AIAgent` returning that agent directly, with no `Workflow`-graph wrapper needed (`isSingleAgentWorkflow`, `packages/adapter-microsoft/src/generate-workflow.ts`). Console output:

```text
Target: microsoft
  Wrote 7 files to /path/to/my-assistant/generated/microsoft
```

(`manifest.json` is written separately by the CLI alongside those 7 — it isn't counted in `filesWritten`.)

## Running the generated project

`Models/PrimaryModel.cs`'s `BuildChatClient()` and every generated tool's `Run(...)` are `NotImplementedException` stubs — Agentform's `model.provider` is a free-form string, so there is no way to derive which concrete `IChatClient` implementation a given provider needs without guessing, and the stub fails immediately and clearly at construction instead. Per the generated `README.md` and `generateCsproj`/`generateEnvExample` (`packages/adapter-microsoft/src/generate-project-files.ts`):

```bash
dotnet restore   # requires the .NET SDK for net10.0
cp .env.example .env   # then fill in your model provider credentials
dotnet run
```

The `.csproj` pins `Microsoft.Agents.AI`/`Microsoft.Agents.AI.OpenAI`/`Microsoft.Agents.AI.Workflows` at `1.13.0` and `OpenAI` at `2.12.0` for `net10.0` (`packages/adapter-microsoft/src/versions.ts`) — `Microsoft.Agents.AI.OpenAI` is referenced proactively so the model-client stub's own TODO comment can point at an already-available package, and `.env.example` suggests `OPENAI_API_KEY` for exactly that reason, alongside a comment naming every declared model and its provider.

## What this adapter does not generate

Only `agent` and `terminate` workflow node types are supported (`NODE_TYPE_LEVELS` in `packages/adapter-microsoft/src/compatibility.ts`) — unlike OpenAI/LangGraph, `tool` has no node-level representation at all in this adapter: tools are always agent-level capabilities here (`agent.tools`), never a standalone workflow graph node. `humanApproval`, `router`, `loop`, and every other remaining node type are `unsupported`, blocking compilation with `AGF5001`:

```text
Error [AGF5001] [microsoft] workflow node (humanApproval) is unsupported: Microsoft Agent Framework has real human-in-the-loop mechanisms (ApprovalRequiredAIFunction at the tool level, RequestPort at the raw executor-graph level), but neither is a node this adapter — which targets AgentWorkflowBuilder's agent-level convenience builders — can faithfully bind to a workflow graph node (at workflow.main.nodes.approve)
```

Agent delegation is where this adapter is unusually precise, not limited: a multi-agent workflow with declared `delegation.allowedAgents` among its participants generates a real `HandoffWorkflowBuilder.WithHandoffs(...)` edge per declaration — an exact per-agent allowlist, with no sharing restriction. The one real constraint is reachability: every handoff source must be reachable from the workflow's entrypoint through some chain of handoff edges, or the framework's own `HandoffWorkflowBuilder.Build()` throws `InvalidOperationException` — `agentform compile` detects this ahead of time (`computeHandoffReachability`, `packages/adapter-microsoft/src/compatibility.ts`) and reports an unreachable delegating agent as a blocking diagnostic rather than generating code that would fail at that point.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
