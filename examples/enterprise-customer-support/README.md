# Enterprise customer support: triage and escalation

A support-ticket triage system for an enterprise SaaS vendor. A triage agent classifies each
incoming ticket and routes it to a billing specialist, a technical specialist, or a direct reply.
Small goodwill credits are within the billing specialist's own authority; anything that reaches
the level of an actual refund is gated behind the billing team lead's explicit approval before the
refund system is ever called.

See [`docs/examples/enterprise-customer-support.md`](../../docs/examples/enterprise-customer-support.md)
for a full walkthrough of the design decisions below.

## Scenario

`triage` (`spec.agents.triage`) looks up the account (`crmLookup`) and searches the knowledge base
(`kbSearch`), then returns a structured `category` (`billing`, `technical`, or `general`),
`urgency`, and `confidence` — declared inline as `triage.outputSchema` rather than via a
`schemaRef` file, in contrast to the `government-workflow` example's file-based schema (both are
valid; this project shows the other option).

The workflow (`spec.workflows.main`) uses an explicit `router` node (`route`) rather than
conditional edges straight off the agent:

- `billing` category → the `billing` agent, which either applies a small `goodwillCredit` itself
  (a `write`-classified tool it calls directly, no gate) or drafts a refund recommendation and
  falls through unconditionally to `refundApproval`, a `humanApproval` node assigned to
  `billing-team-lead`. Only `approved` reaches `refund` (`issueRefund.create`,
  `sideEffect: destructive`); `rejected` terminates at `refundDenied` with nothing charged back.
- `technical` category → the `technical` agent, which replies directly for known issues or drafts
  a reproduction summary that the workflow unconditionally files via `fileEngineeringTicket`.
- Anything else (the router's `default`) → a direct `respond` reply and termination.

## What this demonstrates

- **An explicit `router` node**: `route` is a distinct `type: router` node (`default: respond`)
  rather than the branching-directly-off-an-agent style the other two examples use — both are
  legal; this is the more literal match for an "intent router."
- **The same AF004 pattern applied to a different action**: `issueRefund` is the spec's only
  `destructive` tool, and its workflow node is reachable only through `refundApproval`. The
  contrast with `goodwillCredit` — a `write` tool the `billing` agent calls on its own authority,
  no approval required — is deliberate: small, reversible, capped actions don't need a human in
  the loop; a real refund does.
- **Multi-agent delegation**: `triage.delegation.allowedAgents` lists `billing` and `technical`
  alongside the workflow graph that actually sequences the handoff — three separate `agent`-type
  workflow nodes (`triage`, `billing`, `technical`), each backed by its own agent resource with its
  own prompt file and tool list.
- **Shared conversation memory**: `spec.memory.ticketContext` (`type: conversation`, `scope:
session`, LRU eviction, 30-day retention) is referenced by all three agents' `memory.ref`, so
  context (what triage already learned about the account) carries into whichever specialist picks
  the ticket up.
- **Data residency for a shared model**: all three agents share one model resource
  (`supportModel`); since every agent touches the `confidential`-classified `crmLookup` tool, that
  one model declares `dataResidency: us` — satisfying policy AF009 in a single place instead of
  three.

## Try it

```bash
agentform validate --cwd examples/enterprise-customer-support
agentform graph --cwd examples/enterprise-customer-support
agentform plan --cwd examples/enterprise-customer-support
agentform compile --target langgraph --cwd examples/enterprise-customer-support
```

No environment variables are required — `ticketReply`, `goodwillCredit`, `issueRefund`, and
`engineeringTicket` all use literal placeholder base URLs so `agentform validate` succeeds with
zero setup.

## Verified

- `agentform validate --cwd examples/enterprise-customer-support` — exit `0`,
  `Validation succeeded.`, 15/15 built-in policies pass (also holds under `--strict`).
- `agentform compile --target langgraph --cwd examples/enterprise-customer-support` — exit `0`,
  wrote 19 files to `generated/langgraph/`.
- `agentform compile --target openai` is not expected to succeed here either, for the same reason
  as `government-workflow`: `refundApproval` is a `humanApproval` workflow node, which
  `packages/adapter-openai/src/compatibility.ts` does not generate. LangGraph is the adapter that
  supports `router`, `tool`, and `humanApproval` together
  (`packages/adapter-langgraph/src/compatibility.ts`), which is why `runtime.target` is
  `langgraph`.

## Uncertain / worth double-checking

The `tests/tickets.jsonl` dataset is illustrative in the same way as the other two examples'
datasets — shaped to match `packages/evaluator/src/test-case.ts`, but not run end to end through
`agentform test` as part of this exercise.
