# Agentform import guide

## Purpose

`docs/cli-reference.md`'s `agentform import` section covers the command's flags and exit codes. This guide walks through what it actually recognizes in a real OpenAI Agents SDK project and a real LangGraph project, exactly what ends up in the candidate specification it writes, and — just as important — exactly what it honestly admits it couldn't recover.

Most agentic projects that would benefit from Agentform already exist as hand-written framework code. `agentform import` exists to lower the cost of the first step — not to eliminate it. It inspects an existing project directory and produces a _candidate_ Agentform specification: a real, YAML-shaped starting point, never a finished one. Every recognizer it uses is deliberately simple (regular-expression source scanning, not a real parser for either Python or TypeScript), and every result it produces reports how much of that result to trust. §15.12 of the build specification is explicit about the goal: never claim perfect reverse engineering. This guide exists to make that claim concrete — showing exactly which lines of a real file turn into which lines of the candidate YAML, and which don't turn into anything at all.

## The three recognizers

`agentform import [sourceDir]` (`apps/cli/src/commands/import.ts`) tries three recognizers in order against `[sourceDir]` (default `--cwd`) and stops at the first one that is both `recognized` and produces at least one candidate:

1. **A generated Agentform project** (`inspectGeneratedAgentformProject`, `apps/cli/src/lib/import-generated.ts`) — adapter-agnostic, reading `manifest.json`'s `generatedBy: "agentform"` plus every generated file's own `// Source: <address>` / `# Source: <address>` header comment.
2. **A raw OpenAI Agents SDK project** (`openAiAdapter.inspectExisting`, `packages/adapter-openai/src/inspect-existing.ts`).
3. **A raw LangGraph project** (`langGraphAdapter.inspectExisting`, `packages/adapter-langgraph/src/inspect-existing.ts`).

Both `inspectExisting` hooks are optional members of the `FrameworkAdapter` interface (`docs/adapter-guide.md`) — only these two of the six adapters implement one, matching §15.12's deliberately limited initial scope. Every recognizer returns the same shape, `ImportInspection` (`packages/plugin-sdk/src/adapter.ts`):

```ts
export interface ImportInspection {
  readonly recognized: boolean;
  readonly candidates: readonly ImportCandidate[];
  readonly unsupportedConstructs: readonly string[];
  readonly manualActions: readonly string[];
}
```

and each recovered resource is one `ImportCandidate`:

```ts
export interface ImportCandidate {
  readonly resourceAddress: string;
  readonly kind: string;
  readonly value: Readonly<Record<string, unknown>>;
  /** `0` (pure guess) to `1` (exact). */
  readonly confidence: number;
  readonly detail?: string;
}
```

`recognized: false` from a given recognizer just means "found no trace of this framework" — a normal outcome `import` moves past silently, not an error. A recognizer that finds signals of its own framework but extracts zero usable candidates is treated identically to not recognizing the project at all (`import.ts`'s `Recognizer` loop: `inspection.recognized && inspection.candidates.length > 0`), since there'd be nothing to hand back either way.

## Example: a raw OpenAI Agents SDK project

Given `src/agent.ts`:

```ts
import { Agent, tool } from '@openai/agents';

export const search = tool({
  name: 'web_search',
});

export const triageAgent = new Agent({
  name: 'Triage Agent',
  instructions: 'Route the user to the right specialist.',
  model: 'gpt-4o',
});
```

`inspectOpenAiAgentsProject` first checks whether the project is worth scanning at all — any of a handful of loose recognition signals (`from\s+agents\s+import`, `from ['"]@openai/agents['"]`, etc.) appearing anywhere is enough, deliberately loose since the bar here is only "worth trying," not "definitely this framework." Once recognized, it regex-matches `Agent(` / `new Agent(` call sites (careful to exclude a class declaration like `class TriageAgent(Agent):`) and `tool(`/`@function_tool` call sites, extracts the balanced parenthesized block for each (tracking quote and paren depth so a `)` inside a string doesn't end the block early), and pulls out only literal string values for `name`/`instructions`/`model` via a simple `field: "..."` / `field = "..."` regex. Running `agentform import` against exactly the file above produces:

```
Recognized a raw OpenAI Agents SDK project in "...".
Confidence: 40% (heuristic — review before trusting).

Recovered resources:
  model: 1
  agent: 1
  tool: 1
```

and writes `agentform.import.yaml`:

```yaml
apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication
metadata:
  name: import_demo_openai
  version: 0.1.0
  description: Candidate specification produced by "agentform import" — review required. Recovered resources are best-effort and were not verified against the original source.
spec:
  runtime:
    target: openai
    environment: development
  models:
    gpt_4o:
      provider: openai
      model: gpt-4o
  agents:
    Triage_Agent:
      role: assistant
      instructions:
        text: Route the user to the right specialist.
      model: gpt_4o
  tools:
    web_search:
      type: function
      handler: 'TODO: point this at your tool implementation'
  workflows: {}
```

Every identifier (`gpt_4o`, `Triage_Agent`, `web_search`) comes from `@agentform/core`'s `slugifyIdentifier`, applied to the literal `name`/`model` string that was found (non-alphanumeric runs become `_`; a name with no usable characters falls back to a generated placeholder like `agent_1`). Three things about this output are worth internalizing, since they're the actual per-candidate confidence scores the source assigns, not a single blanket number: the `agent.Triage_Agent` candidate is `0.5` (both a literal `name` and a literal `instructions` string were found — it would have been `0.3` with only one of the two), the `model.gpt_4o` candidate is a flat `0.4` (the model name string is real, but `provider: openai` is always assumed outright rather than read from anywhere — the recognizer's own `detail` field says so explicitly: "provider assumed \"openai\" and not verified against the source"), and the `tool.web_search` candidate is `0.3` (only the name was recoverable — a tool's actual parameters, return shape, and implementation are never reconstructed). The 40% the CLI prints is simply the average of the individual candidates' confidence scores, so it moves as the mix of recovered resource kinds changes, not a fixed "OpenAI import confidence."

The same run's `unsupportedConstructs` and `manualActions` are worth reading in full, since they're the actual honesty mechanism, not filler text:

```
Unsupported constructs (not translated):
  - Tool implementation logic and parameter/return schemas were not translated — only tool names were recognized.
  - Agent handoffs/delegation, guardrails, and structured output (outputType) schemas were not reconstructed.
  - Orchestration logic (Runner.run call sites, loops, conditional branching) was not translated into an Agentform workflow graph.

Manual follow-up required:
  - Review every recovered instructions string against the original source — only a literal string argument could be recovered; f-strings, template literals, and concatenated/multi-line strings were not.
  - Fill in each tool's inputSchema/outputSchema and sideEffect classification by hand — import never recovers these.
  - Add a workflow wiring the recovered agents together — Agentform requires an explicit workflow graph, which the OpenAI Agents SDK does not expose directly.
  - Run "agentform validate" and resolve whatever the schema/semantic checks flag before relying on this candidate specification.
```

Note the last point of `unsupportedConstructs`: the candidate document above has `workflows: {}` — an empty collection. `agentform import` never invents a workflow graph for the OpenAI recognizer, because the SDK itself has no separate graph concept to read one back from (handoffs are agent-level `handoffs: [...]`, not a declared node/edge graph the way LangGraph or Agentform's own IR represent one). This candidate specification will not pass `agentform validate` as written — `spec.workflows` requiring at least a real entrypoint is exactly the kind of gap `manualActions` names.

## Example: a raw LangGraph project

Given `src/graph.py`:

```python
from langgraph.graph import StateGraph

workflow = StateGraph(State)
workflow.add_node("triage", triage_node)
workflow.add_node("specialist", specialist_node)
workflow.add_edge("triage", "specialist")
workflow.set_entry_point("triage")
```

`inspectLangGraphProject` looks for `from langgraph`, `import langgraph`, or a bare `StateGraph(` construction, then regex-matches `.add_node("id", handler)`, `.add_edge("from", "to")`, and `.set_entry_point("id")` call sites — never the handler function bodies themselves. Running `agentform import` produces:

```
Recognized a raw LangGraph project in "...".
Confidence: 27% (heuristic — review before trusting).

Recovered resources:
  agent: 2
  workflow: 1
```

and writes:

```yaml
apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication
metadata:
  name: import_demo_langgraph
  version: 0.1.0
  description: Candidate specification produced by "agentform import" — review required. Recovered resources are best-effort and were not verified against the original source.
spec:
  runtime:
    target: langgraph
    environment: development
  models: {}
  agents:
    triage:
      role: assistant
      instructions:
        text: 'TODO: instructions were not recovered from source — fill in manually.'
    specialist:
      role: assistant
      instructions:
        text: 'TODO: instructions were not recovered from source — fill in manually.'
  tools: {}
  workflows:
    graph:
      entrypoint: triage
      nodes:
        triage:
          type: agent
          agent: triage
        specialist:
          type: agent
          agent: specialist
      edges:
        - from: triage
          to: specialist
```

This is the recognizer's most important honesty caveat, stated directly in its source comment: **every recognized `add_node` becomes a placeholder `agent` resource of type `"agent"`, regardless of what its handler function actually does.** `triage_node`/`specialist_node` could be a tool call, a router, a human-approval gate — LangGraph node handlers are arbitrary Python functions, and guessing a node's real Agentform type from its name or the function it references would be exactly the kind of fabrication §15.12 rules out. That's why every agent candidate here has confidence `0.25` (lower than any OpenAI candidate) and why `unsupportedConstructs` leads with "every node was defaulted to type \"agent\"" and `manualActions` leads with reviewing and correcting that placeholder type by hand. `add_conditional_edges` (LangGraph's conditional-routing construct) is not recognized at all — only unconditional `add_edge` calls are, which is why the recognizer's `unsupportedConstructs` explicitly calls that out whenever it's absent, and why a graph with no `set_entry_point(...)` call gets its own extra note (`graphSpecificNotes` in `inspect-existing.ts`) naming which node's identifier was _guessed_ as the entrypoint (the first `add_node`) rather than found.

## Example: a project Agentform generated itself

`inspectGeneratedAgentformProject` is the one recognizer that can honestly report `confidence: 1` — but only for resource _identity_, never field values. It requires `manifest.json` with `generatedBy: "agentform"` (written by `agentform compile`/`agentform apply`, `docs/compiler-reference.md`), then scans every generated `.ts`/`.tsx`/`.js`/`.jsx`/`.py` file for the `// Source: <address>` / `# Source: <address>` header comment every adapter's `generatedFileHeader` writes. Each recovered address (e.g. `agent.assistant`) becomes a candidate with `value: {}` — deliberately empty, since reconstructing real field values (prompts, model settings, tool schemas) from generated framework code would mean re-implementing that adapter's `generate()` in reverse. `unsupportedConstructs` says so directly: "resource field values ... were not reconstructed from generated code — only resource kind and identifier were recovered." This recognizer exists for the case where the original `agentform.yaml` that produced a generated project has been lost but the generated project itself hasn't — recovering the resource _list_ is still useful as a checklist even when every value has to be retyped by hand.

## From candidates to `agentform.import.yaml`

Once a recognizer produces at least one candidate, `buildCandidateSpecDocument` (`apps/cli/src/lib/import-spec.ts`) assembles them into a full document: `models`/`agents`/`tools`/`workflows` are always present as top-level keys — even empty, as the LangGraph example's `models: {}`/`tools: {}` and the OpenAI example's `workflows: {}` show. `models`, `agents`, and `workflows` are required at the schema level regardless (`packages/schema/src/application.ts`'s `spec` shape — only `tools` is optional there), so a candidate document omitting any of them wouldn't pass `agentform validate` no matter what else it got right; `buildCandidateSpecDocument` always writes all four so the candidate's shape is never wrong for that reason. Each candidate's `resourceAddress` (`<kind>.<id>`) is split to find which collection it belongs in and what key to use; a candidate with a kind `buildCandidateSpecDocument` doesn't recognize, or an address with no `.` in it, is silently skipped rather than corrupting the document.

The file is always written to `agentform.import.yaml` by default (`--out <file>` to choose a different path) — **never** `agentform.yaml` directly, and `agentform import` refuses to overwrite an existing file at that path (exit 14, "Refusing to overwrite existing..."). This mirrors `agentform init`'s refusal to clobber an existing entry file: a low-confidence candidate specification should never silently become — or silently overwrite an attempt at — a project's real entry file. `--target <name>` overrides the candidate's `spec.runtime.target` (default: the recognizer's own default target — `openai` for both the generated-project and OpenAI recognizers, `langgraph` for the LangGraph one); it does not change which recognizer runs or what gets recovered, only the `runtime.target` value written into the candidate document.

## Running it

```bash
agentform import                              # inspect --cwd, write ./agentform.import.yaml
agentform import ./legacy-project             # inspect a specific directory instead
agentform import --out candidate.yaml         # choose a different output filename
agentform import --target langgraph           # override the candidate's runtime.target
agentform --json import                       # machine-readable candidates/confidence/notes
```

`--json` output includes the full `candidates` array (every field of every `ImportCandidate`, not just counts), the averaged `confidence`, and `unsupportedConstructs`/`manualActions` verbatim — everything the human-readable report summarizes, in a form a caller can act on programmatically. If no recognizer matches — the most common case being a framework `agentform import` simply doesn't have a recognizer for yet — the command exits 14 and names exactly what it currently supports, the same message `docs/cli-reference.md`'s Troubleshooting section documents.

Whatever recognizer matches, the next step is always the same: run `agentform validate` against the candidate (after reviewing it, and typically after renaming it to `agentform.yaml` or merging it into an existing project by hand) and work through whatever schema, semantic, or policy diagnostics come back. For the simplest possible recognized project — one agent, a literal `instructions` string, a literal `model`, no tools — the candidate specification genuinely does pass `agentform validate` unmodified; that's the one case `import.test.ts` proves end-to-end. Anything with tools, multiple agents, or LangGraph conditional routing will not, and isn't expected to.

## Scope

- **Regex-based source scanning, not a real Python or TypeScript parser**, for both SDK recognizers. Anything computed at runtime — an f-string, a template literal, a variable, a value assembled in a loop — is invisible to it; only a literal quoted string argument is ever recovered.
- **No tool implementation, parameter schema, or return-shape recovery**, for either SDK. A recognized tool candidate always carries a `TODO` handler placeholder.
- **No handoff/delegation, guardrail, or structured-output (`outputType`) recovery** for the OpenAI recognizer, and **no conditional-routing (`add_conditional_edges`) recovery** for the LangGraph recognizer.
- **No workflow graph at all is inferred for a recognized OpenAI project** — Agentform requires an explicit graph; the SDK doesn't expose one to read back.
- **Every LangGraph node defaults to type `"agent"`** — handler function bodies are never analyzed, so tool/router/human-approval/loop nodes are indistinguishable from plain agent nodes to this recognizer.
- **Three recognizers total**, tried in a fixed order, first actionable match wins — a project using some other framework, or one whose OpenAI/LangGraph usage doesn't match the recognized call-site patterns closely enough, is an honestly-reported limit (exit 14), not a bug to work around.

## Security implications

- Every recognizer only ever reads and pattern-matches file contents as text — none of them `import`/`require`/`exec`/`eval` anything from the project being inspected, regardless of what that project's code actually does. See `docs/security/threat-model.md`'s "Poisoned imported projects" entry for the broader picture.
- `agentform import` reads from `[sourceDir]` but only ever writes to `--out`'s single named path (default `agentform.import.yaml`), and refuses to overwrite an existing file there — the same discipline `agentform init` applies to a project's entry file.
- A `1.0` confidence is never reported for anything recovered by heuristic source scanning — only the generated-project recognizer's resource-_identity_ recovery (reading Agentform's own header comments, a format Agentform itself controls) can honestly claim it, and even then only for identity, never for field values.
- The written candidate specification is never promoted to `agentform.yaml` automatically under any circumstance — a human always has to review it and rename or merge it in themselves.

## Troubleshooting

- **`agentform import` exits 14 with "no supported project was recognized"**: recognition is deliberately limited to three cases — see Scope above. Check that the project actually uses `@openai/agents`/`agents` imports or `langgraph`/`StateGraph`, and that the recognized call-site shapes (`Agent(...)`, `tool(...)`, `.add_node(...)`, etc.) appear literally in the source, not only behind an abstraction the recognizer can't see through.
- **The candidate specification is missing an agent/tool/model I know is in the source**: check whether its defining call used a literal string argument at all — a name or instructions string built via an f-string, template literal, concatenation, or a variable is invisible to both SDK recognizers by design.
- **A recovered `instructions` field is a `TODO` placeholder instead of real text**: either no `instructions`/`instructions=` argument was found as a literal string in the matched call, or (LangGraph) the recognizer never looks inside handler functions at all — it only sees `add_node`'s call site, never `triage_node`'s body.
- **The candidate's `workflows` section is empty (OpenAI) or every node is type `"agent"` (LangGraph)**: both are expected — see the two worked examples above for exactly why neither recognizer can do better here without guessing.
- **`agentform validate` on the candidate specification fails**: expected for anything beyond the single-agent, no-tools case — read the printed "Manual follow-up required" list first; it names the specific gaps (tool handlers, workflow wiring, model provider verification) most likely to be exactly what's failing.
- **`agentform import` exits 14 with "Refusing to overwrite existing..."**: an `agentform.import.yaml` (or your `--out` target) already exists from a previous run — move or remove it first, or pass a different `--out` path.
