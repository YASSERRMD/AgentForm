# LangGraph tutorial

## Overview

LangGraph is a Python library for building stateful, graph-based multi-agent applications on top of a typed shared state. `@agentform/adapter-langgraph` is Agentform's adapter for it — its manifest (`packages/adapter-langgraph/src/adapter.ts`, `LANGGRAPH_ADAPTER_MANIFEST.capabilities`) declares `state-graph`, `agent-node`, `tool-node`, `conditional-edge`, `human-approval`, `loop-limit`, and `typed-state`. This is a broader workflow-node scope than the OpenAI adapter's — LangGraph's own Phase 8 feature list explicitly named human approval and loop limits, so this adapter's `SUPPORTED_NODE_TYPES` covers more of Agentform's workflow schema than any other target (see the compatibility matrix link at the end).

## Scaffold and compile

`langgraph` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`):

```bash
agentform init my-assistant --target langgraph --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` runs `langGraphAdapter.generate()` (`packages/adapter-langgraph/src/adapter.ts`) and writes:

```text
generated/langgraph/
├── manifest.json
├── pyproject.toml
├── .env.example
├── README.md
└── src/
    ├── __init__.py
    ├── state.py
    ├── main.py
    ├── agents/
    │   ├── __init__.py
    │   └── assistant.py
    ├── tools/
    │   └── __init__.py
    └── workflows/
        ├── __init__.py
        └── main.py
```

The `__init__.py` files aren't cosmetic — every generated agent/tool/workflow file uses Python relative imports (`from ..state import State`), which require each directory in the chain to be a real package. `src/workflows/main.py` becomes a `build_graph() -> StateGraph` function assembling a real `langgraph.graph.StateGraph`; `src/agents/assistant.py` becomes an `assistant_node(state: State) -> dict[str, Any]` function; `src/state.py` declares the shared `State(TypedDict)` with `messages: Annotated[list, add_messages]`. Console output:

```text
Target: langgraph
  Wrote 11 files to /path/to/my-assistant/generated/langgraph
```

(`manifest.json` is written separately by the CLI alongside those 11 — it isn't counted in `filesWritten`.)

## Running the generated project

Agent node bodies are honest `NotImplementedError` stubs (LangGraph has no batteries-included "call this model with this prompt" node primitive that doesn't also pull in a specific model-provider integration package, and Agentform's `model.provider` is a free-form string, so guessing which one to import would be fabrication) — the graph wiring itself is real and runnable, but running it raises until you fill those in. Per the generated `README.md` and `generatePyprojectToml`/`generateEnvExample` (`packages/adapter-langgraph/src/generate-project-files.ts`):

```bash
python3 -m venv .venv && source .venv/bin/activate   # requires Python >=3.9
pip install langgraph==0.6.11
cp .env.example .env   # then fill in your model provider credentials
python -m src.main
```

Run it as a module (`python -m src.main`), not `python src/main.py` — bare script execution breaks the relative imports used throughout. `.env.example` documents the declared models (`# primary: provider=openai model=gpt-5`) rather than naming one fixed credential variable — unlike the OpenAI SDK, LangGraph itself has no default credential convention to defer to, since the model provider is free-form. `src/main.py` compiles the graph with a `MemorySaver` checkpointer and passes a fresh `thread_id` per run.

## What this adapter does not generate

`agent`, `tool`, `humanApproval`, `loop`, `router`, and `terminate` are all supported (`SUPPORTED_NODE_TYPES` in `packages/adapter-langgraph/src/compatibility.ts`); `parallel`, `join`, `delay`, `event`, `subworkflow`, `transform`, and `condition` have no generator and are `unsupported`, blocking compilation for this target with `AGF5001`:

```text
Error [AGF5001] [langgraph] workflow node (parallel) is unsupported: "parallel" nodes have no generator in this adapter yet (at workflow.main.nodes.fanout)
```

Separately, `checkpointing` is reported `emulated`, not `supported`: the generated `main.py` wires a real, working `langgraph.checkpoint.memory.MemorySaver`, but it's in-memory only and does not survive a process restart — swap in a persistent checkpointer for production use. Conditional-edge routing functions (for `router` nodes, or any node with more than one outgoing edge or a `when` guard) are generated as stubs regardless, since Agentform has no expression evaluator for `when` conditions anywhere in the codebase — this applies to every adapter that supports conditional routing, not a LangGraph-specific gap.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
