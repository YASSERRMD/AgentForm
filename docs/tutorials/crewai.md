# CrewAI tutorial

## Overview

CrewAI is a Python framework for role-based multi-agent systems, where a `Crew` runs a sequence of `Task`s, each bound to an `Agent` with a `role`/`goal`/`backstory`. `@agentform/adapter-crewai` is Agentform's adapter for it — its manifest (`packages/adapter-crewai/src/adapter.ts`, `CREWAI_ADAPTER_MANIFEST.capabilities`) declares `role-based-agents`, `sequential-tasks`, `tool-registration`, and `delegation`.

## Scaffold and compile

`crewai` is a valid `--target` value (`apps/cli/src/commands/init.ts`'s `VALID_TARGETS`):

```bash
agentform init my-assistant --target crewai --template basic
cd my-assistant
agentform compile
```

`--template basic` scaffolds an `agentform.yaml` with one model (`primary`, provider `openai`, model `gpt-5`), one agent (`assistant`, no tools), and one workflow (`main`) whose only node runs that agent (`apps/cli/src/templates/basic-agent.ts`). `agentform compile` runs `crewAiAdapter.generate()` (`packages/adapter-crewai/src/adapter.ts`) and writes:

```text
generated/crewai/
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

There is no `src/models/` directory here — like ADK, and unlike AutoGen, CrewAI's `llm` field is a plain string, not an object needing its own stub-factory file. `src/agents/assistant.py` becomes a `build_assistant_agent() -> Agent` factory function whose `goal` carries the agent's `instructions.text` and whose `backstory` carries `description` (or a neutral generated fallback, since CrewAI requires a non-empty string there too); `src/workflows/main.py` becomes `build_crew() -> Crew`, one `Process.sequential` crew with a single `Task`. Console output:

```text
Target: crewai
  Wrote 10 files to /path/to/my-assistant/generated/crewai
```

(`manifest.json` is written separately by the CLI alongside those 10 — it isn't counted in `filesWritten`.)

## Running the generated project

Per the generated `README.md` and `generatePyprojectToml`/`generateEnvExample` (`packages/adapter-crewai/src/generate-project-files.ts`):

```bash
python3 -m venv .venv && source .venv/bin/activate   # requires Python >=3.10,<3.14
pip install "crewai==1.15.5"
cp .env.example .env   # then fill in your model provider credentials
python -m src.main
```

Every generated agent sets `llm=` explicitly as a real, prefixed `"<provider>/<model>"` string (`formatLlmString`, `packages/adapter-crewai/src/generate-agent.ts`) — verified directly that CrewAI treats a bare, unprefixed model string as OpenAI regardless of its actual origin, so the prefix is always emitted to avoid silently calling the wrong provider's API. The basic template's `openai` provider is one of the few CrewAI resolves natively with no extra package (`openai`, `gemini`/`google`, `ollama`), so `src/agents/assistant.py` gets a clean `llm="openai/gpt-5"` line; `.env.example` names `OPENAI_API_KEY` and `GOOGLE_API_KEY`/`GEMINI_API_KEY` explicitly, since those are the two provider integrations verified to read those exact variable names automatically. A provider outside that native set gets a TODO comment about installing a matching `crewai[<extra>]` package instead.

## What this adapter does not generate

Only `agent` and `terminate` workflow node types are supported (`NODE_TYPE_LEVELS` in `packages/adapter-crewai/src/compatibility.ts`). `humanApproval` is `unsupported`: CrewAI's real human-in-the-loop primitive, `Task(human_input=True)`, is a review-and-refine loop ("hit Enter to accept, or give feedback to retry") scoped to one specific task, not a graph-level approval gate this adapter can faithfully bind to a workflow node. `tool`, `router`, `loop`, and the rest are also unsupported, blocking compilation with `AGF5001`:

```text
Error [AGF5001] [crewai] workflow node (humanApproval) is unsupported: CrewAI's real human-in-the-loop mechanism (Task(human_input=True), verified against the installed package) is a review-and-refine loop scoped to one specific task, not a graph-level approval gate this adapter can faithfully bind to a node (at workflow.main.nodes.approve)
```

Agent delegation is reported `partial`, not `supported`, wherever a specification declares it: an agent with `delegation.allowedAgents` gets `allow_delegation=True`, CrewAI's own delegate-to-coworker tool — but that mechanism is crew-wide, not scoped to the declared allowlist, so the agent can actually reach every other crew member, not only its declared coworkers. `agentform compile` reports this as a non-blocking warning rather than silently narrowing the generated behavior to match the specification, since CrewAI itself has no mechanism to enforce the narrower scope.

## Further reading

See [docs/compiler-reference.md](../compiler-reference.md) for the full cross-adapter compatibility matrix and every other adapter's construct-by-construct mapping, and [docs/cli-reference.md](../cli-reference.md) for the complete `agentform compile` flag reference (`--target`, `--all`, `--output`, `--clean`) and exit codes.
