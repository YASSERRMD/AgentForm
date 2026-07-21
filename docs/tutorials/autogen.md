# AutoGen tutorial

## Overview

AutoGen is Microsoft's multi-agent conversation framework. `@agentform/adapter-autogen` targets the modern, layered `autogen-agentchat`/`autogen-core`/`autogen-ext` v0.4+ architecture — never the legacy `pyautogen`/`autogen` v0.2 package, which is a different, incompatible API. Its manifest (`packages/adapter-autogen/src/adapter.ts`, `AUTOGEN_ADAPTER_MANIFEST.capabilities`) declares `assistant-agent`, `user-proxy-agent`, `team`, `termination-conditions`, `tool-registration`, and `multi-agent-conversation-flow`.

## Scaffold and compile

`autogen` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`):

```bash
agentform init my-assistant --target autogen --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` runs `autoGenAdapter.generate()` (`packages/adapter-autogen/src/adapter.ts`) and writes:

```text
generated/autogen/
├── manifest.json
├── pyproject.toml
├── .env.example
├── README.md
└── src/
    ├── __init__.py
    ├── main.py
    ├── models/
    │   ├── __init__.py
    │   └── primary.py
    ├── agents/
    │   ├── __init__.py
    │   └── assistant.py
    ├── tools/
    │   └── __init__.py
    └── workflows/
        ├── __init__.py
        └── main.py
```

`src/models/` exists here (unlike the ADK/CrewAI adapters) because AutoGen's `AssistantAgent` needs a real `model_client` object, not a plain string — `src/models/primary.py` becomes a `build_primary_client() -> ChatCompletionClient` stub. `src/agents/assistant.py` becomes a `build_assistant_agent() -> AssistantAgent` factory function; because this workflow has only one agent participant, `src/workflows/main.py` emits a plain `run(task)` function rather than a full `RoundRobinGroupChat` team (`isSingleAgentWorkflow`, `packages/adapter-autogen/src/generate-workflow.ts`). Console output:

```text
Target: autogen
  Wrote 12 files to /path/to/my-assistant/generated/autogen
```

(`manifest.json` is written separately by the CLI alongside those 12 — it isn't counted in `filesWritten`.)

## Running the generated project

Per the generated `README.md` and `generatePyprojectToml`/`generateEnvExample` (`packages/adapter-autogen/src/generate-project-files.ts`):

```bash
python3 -m venv .venv && source .venv/bin/activate   # requires Python >=3.10
pip install "autogen-agentchat==0.7.5" "autogen-ext[openai]==0.7.5"
cp .env.example .env   # then fill in your model provider credentials
python -m src.main
```

`pyproject.toml` pins the `openai` extra of `autogen-ext` specifically, since that's what makes `autogen_ext.models.openai` importable — the most common starting point named in `src/models/primary.py`'s own TODO comment (which also points at `autogen_ext.models.anthropic`/`azure`/`ollama` for other providers). The model-client stub raises immediately and clearly rather than accepting a bare model-name string: verified directly that `AssistantAgent(model_client="gpt-4o")` constructs without error and only fails much later, with a confusing `AttributeError`, the first time the agent actually runs — the generated stub fails at the obvious point instead.

## What this adapter does not generate

Only `agent`, `humanApproval`, and `terminate` are supported (`NODE_TYPE_LEVELS` in `packages/adapter-autogen/src/compatibility.ts`) — AutoGen's Team model has no explicit node graph (it's driven by participants and termination conditions, not declared edges), so `tool`, `router`, `loop`, `parallel`, and the rest have no faithful representation and are `unsupported`, blocking compilation with `AGF5001`:

```text
Error [AGF5001] [autogen] workflow node (router) is unsupported: "router" nodes have no generator in this adapter yet — AutoGen's Team model has no explicit node graph (at workflow.main.nodes.route)
```

`humanApproval` is the one node type in the entire six-adapter compatibility matrix reported `emulated` rather than `supported` or `unsupported`: it maps to a real `UserProxyAgent` participant with a stub `input_func`, which genuinely pauses the conversation for external input, but AutoGen has no purpose-built "approval gate" primitive the way LangGraph's `interrupt()` is — a general-purpose human-participant construct is being repurposed for it. Every generated team also unconditionally gets a `MaxMessageTermination(10) | TextMentionTermination("TERMINATE")` termination condition, regardless of what the specification declares, because a real `RoundRobinGroupChat` built with neither a termination condition nor `max_turns` was verified to loop indefinitely against a real model.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
