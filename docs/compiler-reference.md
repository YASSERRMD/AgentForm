# Agentform compiler and framework adapters

## Purpose

`@agentform/compiler` orchestrates turning a validated `AgentformIR` (`docs/ir-reference.md`) into a real, runnable project for a target framework. It never contains framework-specific logic itself — that lives in one `FrameworkAdapter` package per framework (`@agentform/plugin-sdk`'s interface, §12). All six §4 targets have an adapter as of Phase 9: `@agentform/adapter-openai` (OpenAI Agents SDK, TypeScript), `@agentform/adapter-langgraph` (LangGraph, Python), `@agentform/adapter-microsoft` (Microsoft Agent Framework, C#), `@agentform/adapter-google-adk` (Google Agent Development Kit, Python), `@agentform/adapter-autogen` (AutoGen, Python), and `@agentform/adapter-crewai` (CrewAI, Python). `agentform compile` (`docs/cli-reference.md`) is the only current caller.

## Minimal example

```ts
import { buildIR } from '@agentform/ir';
import { compile } from '@agentform/compiler';
import { openAiAdapter } from '@agentform/adapter-openai';

const { ir } = buildIR(myAgenticApplication);
const result = await compile(ir, openAiAdapter, {
  outputDir: './generated/openai',
  agentformVersion: '0.1.0',
});

if (result.project) {
  for (const file of result.project.files) {
    // write file.path (relative) + file.content — compile() itself never touches disk
  }
}
```

## The `compile()` pipeline

```text
adapter.validateCompatibility(ir) → CompatibilityReport
  hasBlockingIncompatibility? → stop, return diagnostics only, no project
adapter.generate(ir)            → GeneratedProject (files + manifest)
scanForSecretLeaks(files)       → any match? → stop, return diagnostics only, no project
return { project, diagnostics }
```

Every `unsupported` compatibility entry becomes an error diagnostic (`AGF5001`, blocking); every `partial`/`emulated` entry becomes a warning (informational, non-blocking) — §12's "do not silently ignore unsupported specification fields." The secret scan (reusing `@agentform/policy`'s `detectSecret`/`SECRET_PATTERNS`) runs over every generated file's content as the last gate before a caller ever sees a `project` — §22 "avoid secret values" enforced structurally, not just by adapter discipline. `compile()` never writes to disk and never calls `deploy()`/`destroy()` — writing files is `agentform compile`'s job; deploying is `agentform apply`'s (Phase 11).

## `CompatibilityReport`

Each `FeatureSupportEntry` has a `level`: `supported`, `partial`, `emulated`, or `unsupported`. Every adapter reports every workflow node type and tool type in the IR, plus adapter-wide concerns (e.g. LangGraph's checkpointing is always `emulated` — an in-memory `MemorySaver`, not a persistent store). `hasBlockingIncompatibility` is `true` the moment any entry is `unsupported` — see the cross-adapter compatibility matrix below for what each of the six targets actually supports.

## `GeneratedManifest`

Every `GeneratedProject` carries a manifest matching §22's example exactly — `generatedBy`, `agentformVersion`, `specVersion`, `adapter`, `adapterVersion`, `sourceHash`, `irHash`, and **`generatedAt: null`, always** (never a real timestamp — §22 "for reproducibility, avoid timestamps inside deterministic generated artifacts"; a timestamp belongs in apply metadata, not the artifact itself). `agentform compile` writes this to `manifest.json` in each target's output directory — not part of either adapter's own documented source layout, since it's metadata about the generation, not the generated application, so it's written once by the CLI rather than duplicated per adapter.

## OpenAI adapter (`@agentform/adapter-openai`)

Generates a TypeScript project (§13.1's layout: `src/{agents,tools,workflows,policies,observability}/`, `package.json`, `tsconfig.json`, `.env.example`, `README.md`) targeting the real `@openai/agents` SDK.

| Agentform concept                   | Generated as                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                               | `new Agent({ name, instructions, model, modelSettings, tools, handoffs, inputGuardrails, outputType })`                                                                                             |
| Tool (any of the 9 IR tool types)   | `tool({ name, description, parameters, execute })` — `execute` is always a throwing stub (interface, not logic)                                                                                     |
| Handoff                             | `agent.delegation.allowedAgents` → the target agent(s) imported and listed in `handoffs`                                                                                                            |
| Structured output / tool parameters | `inputSchema`/`outputSchema` → Zod source via `jsonSchemaToZodExpression` (always object-shaped at the top level — verified requirement of both `tool()`'s `parameters` and `Agent`'s `outputType`) |
| Guardrail reference                 | A named stub object literal typed `InputGuardrail` (the builder `defineInputGuardrail` exists in the SDK's source but isn't part of its public exports — discovered via a real build, not the docs) |
| Workflow                            | `runWorkflow(input)` calling `run(entrypointAgent, input)` — handoffs are agent-level, so this only needs the entrypoint, not the full node/edge graph                                              |

**Scope**: only `agent`/`tool`/`terminate` workflow node types (`SUPPORTED_NODE_TYPES` in `compatibility.ts`) — `router`/`loop`/`humanApproval`/etc. have no OpenAI-adapter generator and are reported `unsupported`, blocking compilation for a project that uses them against this target. This matches Phase 8's own "basic multi-agent workflow" scope, not a limitation of the SDK itself.

**Verified, not assumed**: every generated construct above was checked against the real installed `@openai/agents@0.13.5` package (`.d.ts` inspection, not training-data recall) and, as the strongest check, a full generated project was `npm install`ed and `npm run build`ed for real against the actual published SDK — zero errors. This caught two real mistakes before they shipped: `defineInputGuardrail` isn't exported (fixed by using the exported `InputGuardrail` type directly), and `z.record(...)` doesn't satisfy the SDK's `ZodObjectLike` constraint (fixed by always falling back to `z.object({})`).

## LangGraph adapter (`@agentform/adapter-langgraph`)

Generates a Python project (§13.2's layout: `src/{agents,tools,workflows}/`, `state.py`, `main.py`, `pyproject.toml`, `.env.example`, `README.md`, plus `__init__.py` files in every package directory — needed for the relative imports used throughout to resolve, even though the layout diagram doesn't show them) targeting the real `langgraph` package.

| Agentform concept                                                              | Generated as                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State graph                                                                    | `StateGraph(State)` in each workflow's `build_graph()`, using `langgraph.graph`'s real API                                                                                                                                        |
| Typed state                                                                    | `state.py`'s `State(TypedDict)`, `messages: Annotated[list, add_messages]` plus one `int` counter per loop node                                                                                                                   |
| Agent node                                                                     | An honest `NotImplementedError` stub — see "Why agent nodes are stubs, not `create_react_agent`" below                                                                                                                            |
| Tool node                                                                      | A real `@tool`-decorated function (`langchain_core.tools`, a verified transitive dependency of `langgraph`), parameters typed from `inputSchema`; wrapped as `ToolNode([...])` in the graph                                       |
| Conditional edge (router, or any node with >1 outgoing edge or a `when` guard) | `add_conditional_edges(node, path_fn, path_map)` — `path_fn` is a stub, since Agentform has no expression evaluator for `when` strings (no `eval`, per the workflow schema's own doc comment)                                     |
| Loop node                                                                      | A **real**, non-stub iteration-counter increment (`state[counter] += 1` is fully mechanical — no business logic to fabricate); its continuation check is a stub but the `max_iterations` limit is a genuine, working safety check |
| Human approval                                                                 | A real `interrupt(payload)` call (verified API), then a stub for acting on the resumed decision                                                                                                                                   |
| Router / terminate node bodies                                                 | Real, non-stub pass-throughs (`return {}`) — there's no logic to fabricate for "do nothing, this is a waypoint/the end"                                                                                                           |

**Scope**: `agent`/`tool`/`router`/`loop`/`humanApproval`/`terminate` (`SUPPORTED_NODE_TYPES` in `compatibility.ts`) — broader than the OpenAI adapter's, matching Phase 8's own "Required LangGraph features" list, which explicitly names human approval and loop limits (unlike the OpenAI feature list). `parallel`/`join`/`delay`/`event`/`subworkflow`/`transform`/`condition` nodes are reported `unsupported`.

### Why agent nodes are stubs, not `create_react_agent`

LangGraph's `langgraph.prebuilt.create_react_agent(model=..., tools=...)` would be the closest LangGraph analogue to the OpenAI adapter's fully-realized `new Agent({...})` — no hand-written model-calling logic needed. It was deliberately not used: its `model` parameter needs either a real `BaseChatModel` instance or a `"provider:model"` string that requires the full `langchain` meta-package installed (verified for real — `ImportError` without it). Agentform's `model.provider` is a free-form string (`@agentform/schema`, not a closed enum), so there is no way to derive which LangChain integration package a given provider needs without guessing — and guessing would be exactly the kind of unverified logic this codebase's adapters avoid. An honest node-function stub, documenting the agent's role/model/instructions/tools in its docstring, was chosen instead — consistent with how the OpenAI adapter treats tool `execute` bodies and guardrail logic.

### Verified, not assumed

Every construct above was checked against the real installed `langgraph==0.6.11` package in a real virtualenv (`inspect.signature` against `StateGraph`/`add_conditional_edges`/`interrupt`/`MemorySaver`/`ToolNode`, not training-data recall). Beyond the required "passes syntax checks" bar (a real `python3 -c "import ast; ast.parse(...)"` subprocess check, `isSyntacticallyValidPython`, run in every generator's test suite — the Python counterpart of the OpenAI adapter's real-TypeScript-compiler syntax check), a full generated project was `pip install`ed and actually run end-to-end: `build_graph().compile(checkpointer=MemorySaver())` produced a real `CompiledStateGraph`, and `python -m src.main` executed the graph through to the entrypoint agent's honest `NotImplementedError` — proving the graph wiring, checkpointing, and execution path are all genuinely functional. This caught a real bug before it shipped: `graph.invoke()` with a checkpointer attached requires a `thread_id` in the call's config or LangGraph raises immediately — fixed by generating a fresh `uuid4()` thread id per run in `main.py`.

## Microsoft Agent Framework adapter (`@agentform/adapter-microsoft`)

Generates a C# project — the only non-TypeScript, non-Python target: `Agents/Tools/Models/Workflows` directories (`PascalCase`, matching each generated class name), a real `.csproj` pinning `Microsoft.Agents.AI`/`Microsoft.Agents.AI.OpenAI`/`Microsoft.Agents.AI.Workflows` 1.13.0 + `OpenAI` 2.12.0 for `net10.0`, and a top-level-statements `Program.cs`.

| Agentform concept                         | Generated as                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent                                     | A static class exposing `Build() -> AIAgent`, wrapping the real `IChatClient.AsAIAgent(instructions:, name:, description:, tools:)`                                      |
| Tool (any of the 9 IR tool types)         | A static class exposing `AsAIFunction()`, wrapping `AIFunctionFactory.Create(Run, name:, description:)` around a throwing `Run(...)` stub                                |
| Model                                     | A static class exposing `BuildChatClient() -> IChatClient`, always a throwing stub (provider is free-form; no way to derive which concrete client to construct)          |
| Single-agent workflow                     | `Build() -> AIAgent`, returning the entrypoint agent directly — no `Workflow` wrapper needed                                                                             |
| Multi-agent workflow, delegation declared | `Build() -> Workflow` via a real `HandoffWorkflowBuilder` (`CreateHandoffBuilderWith`, `.WithHandoffs([source], target)` per declared edge, `.EnableReturnToPrevious()`) |
| Multi-agent workflow, no delegation       | `Build() -> Workflow` via plain `AgentWorkflowBuilder.BuildSequential([...])`                                                                                            |

**Scope**: only `agent`/`terminate` workflow node types — `tool` has no _node_-level representation here (tools are always agent-level capabilities in this adapter, unlike OpenAI/LangGraph's standalone tool nodes); `humanApproval`/`router`/`loop`/etc. are `unsupported`, targeting `AgentWorkflowBuilder`'s agent-level convenience builders rather than the framework's lower-level executor-graph API. **Agent delegation is the one dimension where this adapter is _more_ precise than any other target**: `HandoffWorkflowBuilder.WithHandoffs` represents a per-agent allowlist exactly, with no ADK-style sharing restriction — but it does have a real, verified reachability requirement (every handoff source must be reachable from the entrypoint through some chain of handoff edges, or `Build()` throws a real `InvalidOperationException`), which `validateMicrosoftCompatibility`'s `computeHandoffReachability` detects and blocks before generation would emit code that fails there.

**Verified, not assumed**: every construct above was checked against the real installed `Microsoft.Agents.AI`/`Microsoft.Agents.AI.Workflows` 1.13.0 packages via `dotnet build` and C# reflection against the compiled assemblies (`AgentWorkflowBuilder`'s exact static factory-method overloads, `IChatClient`'s exact interface, `AIFunctionFactory.Create`'s exact overloads) in a real `net10.0` project — not training-data recall. A full generated project was really `dotnet build`-ed (zero errors, zero warnings) and run: `Program.cs` reached real framework internals with no import/type crash, failing only at the documented model-client stub. Went further and separately verified the exact `HandoffWorkflowBuilder` shape this adapter generates against a real fake `IChatClient` — a genuine multi-turn handoff conversation executed through the framework's real orchestration engine (`WorkflowStartedEvent`, `SuperStep` events, `HandoffStart`/`HandoffEnd`), not just compiled. This real testing is also what surfaced the reachability requirement above — caught via a deliberate two-source/one-shared-target compile experiment, not documentation.

## Google ADK adapter (`@agentform/adapter-google-adk`)

Generates a Python project (`src/{agents,tools,workflows}/`, `pyproject.toml`, `.env.example`, `README.md`) targeting the real `google-adk` package.

| Agentform concept                 | Generated as                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                             | `build_<id>_agent() -> LlmAgent`, a factory function (not a module-level constant — real circular-import risk if two agents delegate to each other, verified directly)                                                                                |
| Tool (any of the 9 IR tool types) | A plain, type-hinted Python function — ADK accepts bare functions as tools directly, no decorator needed                                                                                                                                              |
| Model                             | A plain string (`model="gemini-flash-latest"`) for Google/Gemini providers (ADK resolves these natively); a TODO-commented string for every other provider, since ADK's own non-Gemini resolution path is real but unverified for arbitrary providers |
| Delegation                        | `sub_agents=[build_<target>_agent(), ...]` — ADK's own built-in transfer mechanism                                                                                                                                                                    |
| Workflow                          | `build_root_agent()`, returning the entrypoint agent's factory call directly — delegation is fully agent-level via `sub_agents`, so nothing else needs wiring                                                                                         |

**Scope**: only `agent`/`terminate` — `humanApproval` is `unsupported` (not `emulated`, unlike AutoGen): ADK's real, native human-confirmation mechanism (`FunctionTool(func, require_confirmation=True)`, verified end-to-end) operates at the _tool_ level, not the workflow-node level, and inventing which tool call a `humanApproval` node should gate would be fabrication. **ADK enforces a real single-parent tree for `sub_agents`** — verified directly: assigning the same agent as a sub-agent of two different parents raises a real `pydantic.ValidationError` at construction. Since Agentform's `delegation.allowedAgents` is declared independently per agent, two agents could name the same target; `findSharedDelegationTargets` in `compatibility.ts` detects this and reports it as a blocking diagnostic before generation would emit code that fails at import time.

**Verified, not assumed**: every construct above was checked against the real installed `google-adk==2.5.0` package in a real virtualenv, including two structural risks caught via direct experimentation rather than documentation reading: a minimal two-file circular-import reproduction confirmed Python really does raise `ImportError` for the scenario factory functions avoid, and a direct two-parent construction attempt confirmed the single-parent-tree `ValidationError` above. Beyond syntax checks, a full generated project was verified end-to-end: real `py_compile`, a real import test confirming `build_root_agent()` correctly wires `sub_agents` and tools, then a full real `Runner.run_async()` execution against a real `FakeLlm(BaseLlm)` subclass — a genuine successful final response, proving both the generated code and the full ADK orchestration path work correctly.

## AutoGen adapter (`@agentform/adapter-autogen`)

Generates a Python project (`src/{agents,tools,models,workflows}/`, `pyproject.toml` pinning `autogen-agentchat`/`autogen-ext[openai]` 0.7.5, `.env.example`, `README.md`) targeting the real, modern `autogen-agentchat`/`autogen-core`/`autogen-ext` v0.4+ architecture (never the legacy `pyautogen`/`autogen` v0.2 package, a different, incompatible API).

| Agentform concept                 | Generated as                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                             | `build_<id>_agent() -> AssistantAgent`, a factory function (module-level would call the raising model-client stub as an import-time side effect, crashing the whole project on load)                                                                                                                                 |
| Tool (any of the 9 IR tool types) | A plain, type-hinted Python function — `AssistantAgent(tools=[...])` accepts plain functions directly, auto-wrapping them                                                                                                                                                                                            |
| Model                             | `build_<id>_client() -> ChatCompletionClient`, always a throwing stub — verified that a _bare string_ (`model_client="gpt-4o"`) is silently accepted at construction, then fails much later with a confusing `AttributeError` the first time the agent actually runs; the stub fails immediately and clearly instead |
| Delegation                        | `handoffs=[...]` on `AssistantAgent` — a real AutoGen construct                                                                                                                                                                                                                                                      |
| Single-agent workflow             | `run(task)` calling `agent.run(task=task)` directly                                                                                                                                                                                                                                                                  |
| Multi-agent workflow              | `build_team() -> RoundRobinGroupChat`, **always** with a real `termination_condition` — verified gotcha: a team built with neither a termination condition nor `max_turns` loops indefinitely against a real model                                                                                                   |
| Human approval                    | A real `UserProxyAgent` participant with a stub `input_func` — a genuine construct repurposed to pause the conversation, since AutoGen has no purpose-built "approval gate" primitive                                                                                                                                |

**Scope**: `agent`/`terminate`/`humanApproval` (`emulated` for the reason above) — AutoGen's Team model has no explicit node graph (driven by participants + termination conditions, not declared edges), so `router`/`loop`/`parallel`/etc. have no faithful representation and are `unsupported`.

**Verified, not assumed**: every construct above was checked against the real installed `autogen-agentchat`/`autogen-ext` 0.7.5 packages (`inspect.signature`, real scripts actually run, not training-data recall). Beyond syntax checks, a full generated project's stub was reached via a real `python -m src.main` run with no import-time crash, and — going further — a real `ReplayChatCompletionClient` was patched in to run a _full_ team conversation successfully, surfacing and fixing a genuine gotcha in the verification harness itself: the fake client needed `function_calling: True` in its `model_info` since the test agent declared tools, and `AssistantAgent.__init__` eagerly validates that a model with tools supports function calling.

## CrewAI adapter (`@agentform/adapter-crewai`)

Generates a Python project (`src/{agents,tools,workflows}/`, `pyproject.toml` pinning `crewai==1.15.5`, `.env.example`, `README.md`) targeting the real `crewai` package.

| Agentform concept                 | Generated as                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                             | `build_<id>_agent() -> Agent`, a factory function — CrewAI resolves `llm=` into a real client class _eagerly_ in `Agent.__init__`, verified directly, so a module-level constant would crash the project on import for an unrecognized provider                                                |
| `role`/`goal`/`backstory`         | `role` maps directly (free-form, unlike AutoGen/ADK's identifier constraint); `goal` carries `instructions.text`; `backstory` carries `description`, or a neutral fallback (CrewAI requires a non-empty string there too)                                                                      |
| Model                             | `llm="<provider>/<model>"`, always prefixed — verified that a _bare_ model string is always treated as OpenAI regardless of the model's real origin; providers outside a verified-safe set (openai/gemini/google/ollama) get a TODO comment about needing a matching `crewai[<extra>]` install |
| Tool (any of the 9 IR tool types) | An `@tool(...)`-decorated function — verified CrewAI _requires_ both the decorator and a non-empty docstring (a real `ValueError` otherwise), unlike AutoGen/ADK's bare-function convention                                                                                                    |
| Workflow                          | `build_crew() -> Crew`: `Process.sequential` over one `Task` per agent node, chained via `context=[previous_task]` (CrewAI's own real mechanism for passing prior output forward, verified end-to-end)                                                                                         |
| Delegation                        | `allow_delegation=True` — CrewAI's own delegate-to-coworker tool                                                                                                                                                                                                                               |

**Scope**: only `agent`/`terminate` — `humanApproval` is `unsupported`: CrewAI's real `Task(human_input=True)` mechanism (verified against the installed package's own `SyncHumanInputProvider` source) is a _review-and-refine_ loop ("hit Enter to accept, or give feedback to retry") scoped to one specific task, not a graph-level approval gate this adapter can faithfully bind to a node. **Agent delegation is `partial`, not `supported`**: verified directly against `DelegateWorkTool` that CrewAI's `allow_delegation` is crew-wide, not scoped to the declared `allowedAgents` — an agent with delegation enabled can reach _every_ other crew member, not only its declared allowlist; `validateCrewAiCompatibility` reports this as a non-blocking warning rather than silently narrowing it, since CrewAI has no mechanism to actually enforce the narrower scope.

**Verified, not assumed**: every construct above was checked against the real installed `crewai==1.15.5` package in a real virtualenv, including several real gotchas found via direct experimentation: the eager `llm=` resolution and bare-string-defaults-to-OpenAI behavior above, and `Crew(process=Process.hierarchical)` requiring `manager_llm`/`manager_agent` (a real `pydantic.ValidationError` otherwise) — the reason this adapter never generates hierarchical crews. Beyond syntax checks, a full generated project was verified end-to-end: `py_compile`, a real `build_crew()` construction against the installed package, and a full real `Crew.kickoff()` run with a real `BaseLLM` subclass patched onto both agents — a genuine two-task, context-chained, delegation-enabled crew execution producing the correct final output. `python -m src.main` reaches real CrewAI internals with no import-time crash, failing only at the documented point (missing `OPENAI_API_KEY`).

## Cross-adapter compatibility matrix

Transcribed directly from each adapter's own `compatibility.ts` (`NODE_TYPE_LEVELS`/`SUPPORTED_NODE_TYPES`), not hand-guessed — a cross-target test (`apps/cli/src/cross-target.test.ts`) compiles a real spec against all six real adapters and asserts zero blocking diagnostics for the row every column marks `supported`, so this table can't silently drift from the code.

| Workflow node type                                                      | openai                                                                                                                                          | langgraph | microsoft   | google-adk  | autogen     | crewai      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- | ----------- | ----------- | ----------- |
| `agent`                                                                 | supported                                                                                                                                       | supported | supported   | supported   | supported   | supported   |
| `terminate`                                                             | supported                                                                                                                                       | supported | supported   | supported   | supported   | supported   |
| `tool`                                                                  | supported                                                                                                                                       | supported | unsupported | unsupported | unsupported | unsupported |
| `humanApproval`                                                         | unsupported                                                                                                                                     | supported | unsupported | unsupported | emulated    | unsupported |
| `loop`                                                                  | unsupported                                                                                                                                     | supported | unsupported | unsupported | unsupported | unsupported |
| `router`                                                                | unsupported                                                                                                                                     | supported | unsupported | unsupported | unsupported | unsupported |
| `parallel`/`join`/`delay`/`event`/`subworkflow`/`transform`/`condition` | unsupported everywhere — no adapter targets full workflow-graph fidelity yet (see each adapter's own "well-scoped basic translation" reasoning) |           |             |             |             |             |

Only `agent`/`terminate` are `supported` by every target — that's the portable baseline the cross-target test exercises. `tool` as its own _workflow node_ is an OpenAI/LangGraph-only concept: the four Phase 9 targets (Microsoft, ADK, AutoGen, CrewAI) all wire tools onto agents directly (`agent.tools`) rather than as a separate graph node, so a `tool`-type node has no representation there regardless of the underlying tool _type_ — every adapter can generate a stub for all nine IR tool types (`function`/`http`/`openapi`/`mcp`/`database`/`queue`/`agent`/`humanApproval`/`customPlugin`) identically; it's the node-graph placement that differs, not tool-generation capability.

**Agent delegation** (`agent.delegation.allowedAgents`) isn't a workflow node, so it doesn't fit the table above — and it's the dimension where the six targets diverge the most, each shaped by a real, verified constraint of its underlying framework:

- **openai**: real SDK `handoffs` — every declared target becomes a first-class handoff, no known structural hazard.
- **microsoft**: real `HandoffWorkflowBuilder.WithHandoffs(...)` edges — the _most_ precise match of any target (a genuine per-agent allowlist, no sharing restriction), but gated on a verified reachability requirement: every handoff source must be reachable from the workflow's entrypoint or `Build()` throws a real `InvalidOperationException` — `agentform compile` detects and blocks this before it would happen.
- **autogen**: real `handoffs=` on `AssistantAgent`, `emulated` only in the sense that AutoGen's own compatibility report classifies its `humanApproval` mapping that way, not delegation itself.
- **google-adk**: real `sub_agents` — but ADK enforces a single-parent tree; two agents naming the same delegate is a real `pydantic.ValidationError`, caught and blocked before generation.
- **crewai**: real `allow_delegation=True` — but CrewAI's delegation tool is crew-wide, not scoped to the declared allowlist; every agent with delegation enabled can reach every other crew member, reported `partial`, not blocking.
- **langgraph**: documented only — `delegation.allowedAgents` appears in the generated agent's docstring as a hint, but isn't wired into real conditional routing in this adapter's current scope (its routing is driven by the workflow's own graph edges, not agent-declared delegation).

**Adapter-wide entries** beyond node/tool/delegation support: OpenAI reports `sessions`/`tracing hooks`/`tool restrictions` as `partial` (not yet generated, but real SDK features); LangGraph reports `checkpointing` as `emulated` (a real, working `MemorySaver`, but in-memory only — swap in a persistent checkpointer for production).

## `agentform compile`

See `docs/cli-reference.md`'s `agentform compile` section for the CLI flags (`--target`/`--all`/`--output`/`--clean`) and exit codes (8 = compilation failure, 13 = unsupported target feature).

## Scope

- All six `runtime.target` schema values (`openai`, `langgraph`, `microsoft`, `google-adk`, `autogen`, `crewai`) have adapters as of Phase 9 — see each adapter's own package for its verified construct-by-construct mapping.
- No `deploy()`/`destroy()`/`inspectExisting()` implementation yet — `FrameworkAdapter`'s optional members (§12) stay unimplemented until `agentform apply`/`import`/`destroy` exist (Phase 11).
- No expression evaluator for workflow edge `when` conditions — every conditional-routing function either adapter generates is a stub for this reason, not a missed feature.
- `${env.*}` references are already fully resolved into the IR by the time the compiler sees it (Phase 3's interpolation runs before schema validation) — the compiler has no visibility into which IR fields originated from an environment variable. This is why "never embed credentials" is enforced by (a) adapters never emitting an IR field's literal value into a place a real credential would end up, relying on the target SDK's own env-var conventions instead, plus (b) the secret-leak scan as a structural safety net, not by env-reference tracking through the pipeline.

## Security implications

- The secret-leak scan (`scanForSecretLeaks`) blocks `compile()` from ever returning a `project` whose files contain a secret-shaped value, regardless of which adapter produced them.
- No adapter's generated code embeds a credential value anywhere — every one documents required environment variables (`.env.example`) instead and relies on the target SDK/runtime's own env-var conventions.
- Every stubbed function body (tool `execute`/`Run`, agent node logic, model-client construction, routing decisions, guardrail logic) fails loudly (`throw`/`raise NotImplementedError`/`throw new NotImplementedException`) rather than silently doing nothing or fabricating plausible-looking behavior — a project that hasn't been filled in yet fails fast and obviously when run, not subtly.
- See `docs/security/threat-model.md` for the full cross-package picture, updated alongside this document for Phase 9.

## Troubleshooting

- **`agentform compile` exits 13**: the project uses a workflow node or tool type the target adapter doesn't generate — the diagnostic message names the specific feature and target (e.g. `[openai] workflow node (humanApproval) is unsupported`). Either remove/replace that node for this target, or compile against a target that does support it (check the tables above).
- **A generated file raises `NotImplementedError`/throws immediately when run**: expected — Agentform generates a project's _interface_ (agents, tools, graph wiring), never its business logic. Fill in the named TODO.
- **LangGraph's `graph.invoke()` raises about a missing `thread_id`**: only relevant if you're calling `.compile(checkpointer=...)` yourself outside the generated `main.py` (which already handles this) — any checkpointed graph needs `config={"configurable": {"thread_id": "..."}}` passed to `invoke()`/`stream()`.
- **A generated Python import fails**: check you're running via `python -m src.main` from the project root (module execution, required for the relative imports used throughout), not `python src/main.py` (bare script execution breaks relative imports) — see the generated `README.md`.
