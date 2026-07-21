# Example walkthrough: enterprise customer support

## Purpose

[`examples/enterprise-customer-support/`](../../examples/enterprise-customer-support/) is a
support-ticket triage and escalation system for an enterprise SaaS vendor: a triage agent reads
each incoming ticket, routes it to a billing specialist, a technical specialist, or a direct reply,
and — the one action in this specification classified `destructive` — a real refund cannot be
issued until the billing team lead approves it. `cd examples/enterprise-customer-support &&
agentform validate` succeeds today, with zero setup.

## Resource layout

| Collection    | Contents                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`      | `supportModel` — one model resource shared by all three agents, `dataResidency: us`.                                                                                                |
| `tools`       | `crmLookup`, `kbSearch` (`mcp`, `read`); `ticketReply`, `goodwillCredit`, `engineeringTicket` (`http`, `write`); `issueRefund` (`http`, `destructive`).                             |
| `agents`      | `triage`, `billing`, `technical` — three agents, each with its own prompt file and tool list, all sharing `supportModel` and the `ticketContext` memory.                            |
| `memory`      | `ticketContext` — `type: conversation`, `scope: session`, `retention: 30d`, `eviction: lru`.                                                                                        |
| `workflows`   | `main` — `triage` (agent) → `route` (`router`) → `billing`/`technical`/`respond`; `billing` → `refundApproval` (`humanApproval`) → `refund`; `technical` → `fileEngineeringTicket`. |
| `policies`    | `human-approval-before-refund`, `restrict-customer-data-residency` (descriptive references, separate from the 15 built-in `AF0xx` policies).                                        |
| `evaluations` | `datasets: [tests/tickets.jsonl]`, `thresholds` on `taskSuccess`/`policyViolations`/`maximumAverageCostUsd`.                                                                        |
| `outputs`     | `refundEndpoint` — the billing system's base URL.                                                                                                                                   |

This is the only one of the three examples that declares an explicit `router` node
(`packages/schema/src/workflow.ts`'s `routerNodeSchema`) rather than branching directly off an
agent node with conditional edges — both are valid; `government-workflow` and `regulated-approval`
use the latter style. `route`'s `default: respond` documents the router's fallback target; nothing
in `packages/ir/src/semantic/graph.ts` cross-checks a router's `default` field against its actual
edges (it is documentation, not an enforced constraint) — the graph's own edge-conflict check is
what actually matters, and it passes here because exactly one of `route`'s three outgoing edges
(`respond`) has no `when` guard.

## Two consequential actions, two different postures

The specification draws a deliberate line between `goodwillCredit` and `issueRefund`:

- `goodwillCredit` is `sideEffect: write`, listed directly in `billing.tools`, and callable by the
  `billing` agent on its own authority within a single turn — the prompt
  (`prompts/billing.md`) scopes this to small, unambiguous, already-documented cases.
- `issueRefund` is `sideEffect: destructive`, appears in no agent's `tools` list, and is reachable
  only through the `refund` workflow node, which has an incoming edge from `refundApproval` (a
  `humanApproval` node). This is the structural shape policy **AF004**
  (`packages/policy/src/policies/af004-critical-actions-require-human-approval.ts`) requires for
  every `destructive` tool node — the same pattern `government-workflow` applies to
  `citationRegistry` and `regulated-approval` applies to `executeTransfer`, applied here to a
  billing action instead of a legal or financial one.

`billing.guardrails` additionally lists `no-refund-amount-promises-in-free-text` — a guardrail
identifier (`packages/schema/src/agent.ts`'s `agentSchema.guardrails`, an open string array with
no built-in enforcement yet) documenting an intent the workflow structure alone doesn't capture:
the agent shouldn't commit to a number before a human has approved it.

## One model, three agents, one residency declaration

`triage`, `billing`, and `technical` all reference the same model resource, `supportModel`, rather
than three near-identical model declarations. Since every one of the three agents' tool lists
includes `crmLookup` (`dataClassification: confidential`), policy **AF009**
(`sensitive-data-requires-residency`) requires `supportModel` to declare `dataResidency` — set once
(`us`) instead of three times. This is a direct consequence of sharing the model resource: had each
agent used its own model, each would need its own `dataResidency`.

`triage.delegation.allowedAgents` lists `billing` and `technical` in addition to the workflow graph
already sequencing the same handoff through `route`'s conditional edges — `delegation` is agent
metadata describing which agents `triage` may hand off to; the workflow graph is what actually
executes the handoff. Neither is redundant: the workflow graph is the authoritative execution path
this specification compiles to, and `delegation` is descriptive of the intended relationship
between agents independent of any one workflow.

## Compile target

`runtime.target` is `langgraph`, for the same structural reason as `government-workflow`:
`refundApproval` is a `humanApproval` workflow node, and `packages/adapter-openai/src/
compatibility.ts` does not generate that node type (`agentform compile --target openai` would
block with `AGF5001`, exit `13`). LangGraph's compatibility report additionally lists `router` as
`supported`, so this example's explicit router node is not a second reason to avoid OpenAI as a
target — `humanApproval` alone already rules it out. `agentform compile --target langgraph --cwd
examples/enterprise-customer-support` writes 19 files to `generated/langgraph/` with no blocking
diagnostics.

## Verification

```text
$ agentform validate --cwd examples/enterprise-customer-support
Policy: 15 evaluated — 15 passed, 0 warned, 0 failed, 0 skipped.
Validation succeeded.
$ echo $?
0
```

`--strict` produces the same result — no outstanding policy warnings. See
[`examples/enterprise-customer-support/README.md`](../../examples/enterprise-customer-support/README.md)
for the full scenario description and the exact commands to reproduce this.
