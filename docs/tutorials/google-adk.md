# Google ADK tutorial

## Overview

Google's Agent Development Kit (`google-adk`) is a Python framework for building hierarchical multi-agent systems, where agents delegate to sub-agents through a built-in transfer mechanism. `@agentform/adapter-google-adk` is Agentform's adapter for it — its manifest (`packages/adapter-google-adk/src/adapter.ts`, `GOOGLE_ADK_ADAPTER_MANIFEST.capabilities`) declares `agent-hierarchy`, `tools`, `sessions`, and `model-configuration`.

## Scaffold and compile

`google-adk` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS` — hyphenated, not `googleadk`):

```bash
agentform init my-assistant --target google-adk --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` runs `googleAdkAdapter.generate()` (`packages/adapter-google-adk/src/adapter.ts`) and writes:

```text
generated/google-adk/
├── manifest.json
├── pyproject.toml
├── .env.example
├── README.md
└── src/
    ├── __init__.py
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

There is no `src/models/` directory here — unlike the AutoGen adapter, ADK's `model` field accepts a plain string directly, so it needs no separate stub-factory file per model. `src/agents/assistant.py` becomes a `build_assistant_agent() -> LlmAgent` factory function (a factory rather than a module-level constant specifically to avoid a real circular-import failure when two agents delegate to each other); `src/workflows/main.py` becomes `build_root_agent()`, calling that factory directly — delegation between agents is fully encoded via ADK's own `sub_agents` at the agent level, so the workflow file's only job is naming the entrypoint. Console output:

```text
Target: google-adk
  Wrote 10 files to /path/to/my-assistant/generated/google-adk
```

(`manifest.json` is written separately by the CLI alongside those 10 — it isn't counted in `filesWritten`.)

## Running the generated project

Per the generated `README.md` and `generatePyprojectToml`/`generateEnvExample` (`packages/adapter-google-adk/src/generate-project-files.ts`):

```bash
python3 -m venv .venv && source .venv/bin/activate   # requires Python >=3.10
pip install "google-adk==2.5.0"
cp .env.example .env   # then fill in your model provider credentials
python -m src.main
```

ADK natively resolves a plain model-name string for its own Gemini models, so `.env.example` names `GOOGLE_API_KEY` explicitly as the one credential the adapter's own generated code can point at with confidence. The basic template's default model provider is `openai`, though, not `google`/`gemini` — `isGoogleProvider("openai")` is false, so the generated `src/agents/assistant.py` carries a TODO comment above its `model=` line noting that non-Gemini providers typically need a real `BaseLlm` instance instead of a plain string (`generateAgentFile`, `packages/adapter-google-adk/src/generate-agent.ts`). Point `agentform.yaml`'s model at a `google`/`gemini`/`vertex` provider before compiling if you want the clean, natively-resolved path instead of that TODO.

## What this adapter does not generate

Only `agent` and `terminate` workflow node types are supported (`NODE_TYPE_LEVELS` in `packages/adapter-google-adk/src/compatibility.ts`). `humanApproval` is `unsupported` here — notably not `emulated`, unlike AutoGen's equivalent entry — because ADK's real, native human-confirmation mechanism (`FunctionTool(func, require_confirmation=True)`) operates at the tool level, not the workflow-node level, and there's no reliable way to infer which tool call a graph-level `humanApproval` node should gate. `tool`, `router`, `loop`, and the rest are also unsupported, blocking compilation with `AGF5001`:

```text
Error [AGF5001] [google-adk] workflow node (humanApproval) is unsupported: ADK has a real tool-level confirmation mechanism (FunctionTool require_confirmation=True), but no workflow-node-level equivalent this adapter can faithfully target (at workflow.main.nodes.approve)
```

Agent delegation has a real structural hazard worth knowing about even where it is supported: ADK enforces a single-parent tree for `sub_agents` — assigning the same agent as a delegate of two different parents raises a real `pydantic.ValidationError` at construction. If two agents in a specification both name the same delegation target, `agentform compile` detects it (`findSharedDelegationTargets`, `packages/adapter-google-adk/src/compatibility.ts`) and reports a blocking diagnostic rather than generating code that would fail at import time.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
