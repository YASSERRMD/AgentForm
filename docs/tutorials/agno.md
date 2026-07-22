# Agno tutorial

## Overview

Agno is a Python framework for building agents, multi-agent teams, and structured workflows, with native support for tool-level and step-level human-in-the-loop confirmation. `@agentform/adapter-agno` is Agentform's adapter for it — added post-v1, not part of the original six-target release (see `docs/compiler-reference.md`'s Agno section and ADR-0015). Its manifest (`packages/adapter-agno/src/adapter.ts`, `AGNO_ADAPTER_MANIFEST.capabilities`) declares `step-based-workflows`, `loop-parallel-condition-router`, `blocking-human-approval`, and `tool-registration`. Agno's own `Step`/`Loop`/`Parallel`/`Condition`/`Router` workflow primitives map unusually directly onto Agentform's own node vocabulary, giving this adapter the richest node-type coverage of any target after LangGraph.

## Scaffold and compile

`agno` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`):

```bash
agentform init my-assistant --target agno --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent. `agentform compile` runs `agnoAdapter.generate()` (`packages/adapter-agno/src/adapter.ts`) and writes:

```text
generated/agno/
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

The `__init__.py` files aren't cosmetic — every generated agent/tool/workflow file uses Python relative imports (`from ..agents.assistant import build_assistant_agent`), which require each directory in the chain to be a real package. `src/workflows/main.py` becomes a `build_main_workflow() -> Workflow` function assembling a real `agno.workflow.Workflow`; `src/agents/assistant.py` becomes a `build_assistant_agent() -> Agent` function. Console output:

```text
Target: agno
  Wrote 10 files to /path/to/my-assistant/generated/agno
```

(`manifest.json` is written separately by the CLI alongside those 10 — it isn't counted in `filesWritten`.)

## Running the generated project

Agent construction is real and complete for `openai`/`anthropic`/`google` model providers (`agno.models.<provider>.<Class>(id=...)`, verified against the installed package); other providers get `model=None` with a TODO pointing at `docs.agno.com/models`. Tool and stub-step bodies are honest `NotImplementedError` stubs — Agentform declares a tool's interface, never its implementation. Per the generated `README.md` and `generatePyprojectToml`/`generateEnvExample` (`packages/adapter-agno/src/generate-project-files.ts`):

```bash
python3 -m venv .venv && source .venv/bin/activate   # requires Python >=3.9,<4
pip install "agno==2.8.0" "fastapi==0.139.2"
cp .env.example .env   # then fill in your model provider credentials
python -m src.main
```

`fastapi` is a direct dependency here, not just a transitive one you can leave to chance: `agno.workflow`'s own `__init__.py` unconditionally imports `agno.workflow.remote.RemoteWorkflow`, which requires `fastapi` — verified directly against the installed package (`import agno.workflow` raises `ModuleNotFoundError` without it), even though `agno`'s own package metadata marks `fastapi` as belonging to an optional extra. `.env.example` documents `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` (each read automatically by the matching `agno.models` class) plus the declared models in the application, rather than naming one fixed credential variable. Run it as a module (`python -m src.main`), not `python src/main.py` — bare script execution breaks the relative imports used throughout.

## What this adapter does not generate

`agent`, `tool`, `humanApproval`, `loop`, `parallel`, `router`, `condition`, `subworkflow`, `transform`, `delay`, and `terminate` are all supported (`SUPPORTED_NODE_TYPES` in `packages/adapter-agno/src/compatibility.ts`); only `join` and `event` have no generator and are `unsupported`, blocking compilation for this target with `AGF5001`:

```text
Error [AGF5001] [agno] workflow node (event) is unsupported: waiting on an external event trigger has no synchronous Agno Step equivalent to translate to honestly (at workflow.main.nodes.wait)
```

`join` is unsupported for a related reason: Agno's join semantics belong to the `Parallel` construct that fans out, not to a standalone downstream node — there's no construct a `join` node on its own can faithfully bind to. Separately, this adapter never attempts full graph-region reconstruction: Agentform's workflow model is a general graph (cycles allowed only through `loop` nodes), while Agno's is fundamentally an ordered step sequence with structured nesting. A `parallel` node's branches and a `router`/`condition` node's choices come from that node's own declared `branches` field or its own outgoing edges — unambiguous, real IR data, not guessed — but a `loop` node's body, and every `router`/`condition`'s selector/evaluator logic, are generated as `NotImplementedError` stubs, since Agentform has no expression evaluator for `when`/`expression` text anywhere in the codebase (the same gap every adapter that supports conditional routing has).

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, [docs/registry-reference.md](../registry-reference.md) if you're combining Agno with reusable modules, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
