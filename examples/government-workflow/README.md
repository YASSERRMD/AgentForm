# Government workflow: municipal code-enforcement complaint intake

A citizen-complaint intake system for a municipal code-enforcement department. Citizens report
issues (noise, junk vehicles, illegal dumping, unpermitted construction); an agent classifies each
complaint and recommends either a formal citation or a log-only record. Every citation — a legally
binding act against a property owner — requires a supervisor's sign-off before it is issued. There
is no path in this workflow where the agent issues a citation on its own.

See [`docs/examples/government-workflow.md`](../../docs/examples/government-workflow.md) for a
full walkthrough of the design decisions below.

## Scenario

`intake` (`spec.agents.intake`) is the only agent. For each complaint it:

1. Confirms the parcel and pulls zoning/ownership data with the read-only `parcelLookup` tool.
2. Searches `complaintRegistry` for an existing open complaint at the same parcel before treating
   the report as new.
3. Classifies the complaint and returns a structured `category`, `confidence`, and a
   `recommendation` of either `citation` or `log-only` (`schemas/classification.json`, bound via
   `spec.models.intakeModel.responseFormat.schemaRef`).

The workflow (`spec.workflows.main`) then branches on `output.recommendation`:

- `log-only` complaints go straight to the `logComplaint` tool node (`complaintRegistry.create`,
  `sideEffect: write`) and terminate.
- `citation` recommendations route to `citationApproval`, a `humanApproval` node assigned to
  `code-enforcement-supervisor`. Only an `approved` outcome reaches `issueCitation`
  (`citationRegistry.create`, `sideEffect: destructive`); a `rejected` outcome terminates at
  `citationDenied` and nothing is ever written to the citation system.

## What this demonstrates

- **Policy AF004 (critical actions require human approval)**: `citationRegistry` is the only
  `destructive` tool in the spec, and the `issueCitation` workflow node that calls it has an
  incoming edge from the `citationApproval` `humanApproval` node — this is the exact structural
  pattern AF004 checks for (`packages/policy/src/policies/af004-critical-actions-require-human-approval.ts`).
  Remove that edge, or reclassify `citationRegistry` as `write`, and `agentform validate` starts
  failing with an `AF004` error.
- **Agent-level scoping as a second, independent safeguard**: `intake.tools` lists `parcelLookup`
  and `complaintRegistry` but deliberately omits `citationRegistry`. The agent cannot call the
  citation API even if it wanted to — the workflow's gated `issueCitation` node is the only path to
  it. The prompt (`prompts/intake.md`) states this explicitly, but the tool list enforces it
  structurally regardless of what the model does.
- **`file`/`schemaRef` references**: `intake.instructions` loads from `prompts/intake.md`, and the
  model's `responseFormat` loads from `schemas/classification.json` — both resolved by
  `@agentform/parser` at load time, not inlined into the YAML.
- **Session memory**: `spec.memory.intakeSession` (`type: session`, TTL eviction, 24h retention)
  is referenced from `intake.memory.ref`, scoping conversational context to one intake session.
- **Data classification and residency**: `complaintRegistry` and `citationRegistry` are both
  `dataClassification: confidential` (citizen and property-owner PII); `intakeModel` declares
  `dataResidency: us` to satisfy policy AF009 (a model backing an agent that touches
  confidential/restricted data must declare where that data stays).
- **An `outputs` block**: `citationEndpoint` exposes the citation system's base URL as a named
  output, in the same spirit as a Terraform output.

## Try it

```bash
agentform validate --cwd examples/government-workflow
agentform graph --cwd examples/government-workflow
agentform plan --cwd examples/government-workflow
agentform compile --target langgraph --cwd examples/government-workflow
```

No environment variables are required — every external endpoint in this spec is a literal
placeholder URL (`https://api.city.example.gov`) rather than a `${env.*}` reference, specifically
so `agentform validate` succeeds immediately with zero setup. A real deployment would replace
these with `${env.COMPLAINT_API_URL}`-style references and a `.env` file.

## Verified

- `agentform validate --cwd examples/government-workflow` — exit `0`, `Validation succeeded.`,
  15/15 built-in policies pass (also holds under `--strict`, so there are no warnings either).
- `agentform compile --target langgraph --cwd examples/government-workflow` — exit `0`, wrote 14
  files to `generated/langgraph/`.
- `agentform compile --target openai --cwd examples/government-workflow` — **blocked**, exit `13`:
  `AGF5001 workflow node (humanApproval) is unsupported: "humanApproval" nodes are beyond this
adapter's basic multi-agent workflow support`. This is expected, not a bug in this spec: per
  `packages/adapter-openai/src/compatibility.ts`, the OpenAI Agents SDK adapter only generates
  `agent`/`tool`/`terminate` nodes. LangGraph is the adapter whose compatibility report
  (`packages/adapter-langgraph/src/compatibility.ts`) lists `humanApproval` as natively
  `supported` alongside `tool`, which is why `runtime.target` is `langgraph` here.

## Uncertain / worth double-checking

The `tests/complaints.jsonl` dataset is illustrative — `spec.evaluations.datasets` only needs to
resolve to a path string for `agentform validate`/`agentform plan` (dataset content is read by
`agentform test`, which this exercise didn't require running end to end).
