# Example walkthrough: government workflow

## Purpose

[`examples/government-workflow/`](../../examples/government-workflow/) is a municipal
code-enforcement complaint-intake system: citizens report violations, an agent classifies each
report and recommends either a citation or a log-only record, and a human supervisor must sign off
before any citation — a legally binding act against a property owner — is actually issued. It is
one of three worked examples (alongside `enterprise-customer-support` and `regulated-approval`)
that exercise the full specification against the real CLI, not just illustrative snippets: `cd
examples/government-workflow && agentform validate` succeeds today, with zero setup.

## Resource layout

The specification declares one model, three tools, one agent, one memory resource, a six-node
workflow, two descriptive policy references, an evaluation block, observability settings, and one
output — every top-level `spec` collection `packages/schema/src/application.ts` allows except
`deployment` and `modules`.

| Collection    | Contents                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `models`      | `intakeModel` — `openai`/`gpt-5`, `temperature: 0`, a `responseFormat.schemaRef` pointing at `schemas/classification.json`, `dataResidency: us`.                                                                   |
| `tools`       | `parcelLookup` (`mcp`, `read`); `complaintRegistry` (`http`, `write`, two operations — `search` and `create`); `citationRegistry` (`http`, `destructive`, one operation — `create`).                               |
| `agents`      | `intake` — the only agent, instructions loaded from `prompts/intake.md`, tools `[parcelLookup, complaintRegistry]`, memory `intakeSession`.                                                                        |
| `memory`      | `intakeSession` — `type: session`, `scope: session`, `retention: 24h`, `eviction: ttl`.                                                                                                                            |
| `workflows`   | `main` — `intake` (agent) → either `citationApproval` (`humanApproval`) → `issueCitation` (tool) → `closed`, or `logComplaint` (tool) → `closed`; a `rejected` path (`citationDenied`) if the supervisor declines. |
| `policies`    | `human-approval-before-citation`, `restrict-complaint-data-residency` — descriptive references, distinct from the 15 built-in `AF0xx` policies that run unconditionally regardless of this list.                   |
| `evaluations` | `datasets: [tests/complaints.jsonl]`, `thresholds` on `taskSuccess`/`policyViolations`/`maximumAverageCostUsd`.                                                                                                    |
| `outputs`     | `citationEndpoint` — the citation system's base URL.                                                                                                                                                               |

## The central design decision: two independent gates on one action

`citationRegistry` is the specification's only `destructive`-classified tool, and it is guarded
twice, at two different layers:

1. **Structurally, in the workflow graph.** The `issueCitation` tool node has an incoming edge
   from `citationApproval`, a `humanApproval` node, and that edge's `when` guards on
   `approval.status == "approved"`. This is exactly the shape policy **AF004** (`critical-actions-
require-human-approval`, `packages/policy/src/policies/af004-critical-actions-require-human-
approval.ts`) checks for: a workflow `tool` node calling a `destructive` tool must have an
   incoming edge from a node of type `humanApproval`. Delete that edge, or change
   `citationRegistry.sideEffect` to `write`, and `agentform validate` starts failing with an
   `AF004` diagnostic.
2. **At the agent level, independently of the graph.** `intake.tools` lists `parcelLookup` and
   `complaintRegistry` but not `citationRegistry` — the model backing `intake` has no way to call
   the citation API even if a prompt-injection attempt or a reasoning error tried to make it. The
   only way `citationRegistry.create` is ever invoked is the workflow's own `issueCitation` node,
   reached only after a human approves.

This mirrors a theme visible across all three examples: the agent is scoped to _recommend_, and a
separate, explicit, always-present graph node _enacts_ the consequential step. Nothing about the
schema forces this pattern — an author could list `citationRegistry` in `intake.tools` and it
would still validate, since AF004 only inspects the workflow graph, not agent tool lists. It's a
deliberate authoring choice this example is meant to illustrate, not a requirement the tooling
enforces on its own.

## Two tools, one HTTP base, two side-effect classifications

`complaintRegistry` bundles a `search` operation (used internally by the agent to check for
duplicates) and a `create` operation (used by the `logComplaint` workflow node) under one tool
resource, classified `sideEffect: write` as a whole — `packages/schema/src/tool.ts`'s
`httpToolSchema` classifies side effects per _tool_, not per _operation_, so a tool that mixes a
read-like and a write-like operation takes the more consequential classification. This is the same
convention `apps/cli/src/templates/government-complaint-workflow.ts`'s built-in starter template
uses for its own `complaintRegistry` tool.

## Data residency

Both `complaintRegistry` and `citationRegistry` are `dataClassification: confidential` (they carry
citizen and property-owner PII). Because `intake.tools` includes `complaintRegistry`, policy
**AF009** (`sensitive-data-requires-residency`) requires `intake`'s model — `intakeModel` — to
declare `dataResidency`, which it does (`us`). This is a real validation dependency, not
decoration: removing `dataResidency: us` from `intakeModel` while `complaintRegistry` stays
`confidential` reproduces an AF009 failure.

## Compile target

`runtime.target` is `langgraph`. This is not an arbitrary choice: `agentform compile --target
openai --cwd examples/government-workflow` is blocked (exit `13`, `AGF5001`) because
`packages/adapter-openai/src/compatibility.ts` only generates `agent`/`tool`/`terminate` workflow
nodes — `humanApproval` is explicitly `unsupported` there. LangGraph's own compatibility report
(`packages/adapter-langgraph/src/compatibility.ts`) lists `humanApproval` as natively `supported`
alongside `agent`, `tool`, `loop`, `router`, and `terminate`, which is the node-type set this
example (and the other two) stays within. `agentform compile --target langgraph --cwd
examples/government-workflow` writes 14 files to `generated/langgraph/` with no blocking
diagnostics.

## Verification

```text
$ agentform validate --cwd examples/government-workflow
Policy: 15 evaluated — 15 passed, 0 warned, 0 failed, 0 skipped.
Validation succeeded.
$ echo $?
0
```

The same command with `--strict` (warnings also fail) produces an identical result — this
specification has no outstanding policy warnings (every tool declares a `timeout`, satisfying the
otherwise-non-mandatory AF006). See [`examples/government-workflow/README.md`](../../examples/government-workflow/README.md)
for the full scenario description and the exact commands to reproduce this.
