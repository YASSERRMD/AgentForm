# Example walkthrough: regulated approval

## Purpose

[`examples/regulated-approval/`](../../examples/regulated-approval/) is an outbound wire-transfer
review workflow for a regulated financial-services setting: an agent screens every transfer for
sanctions/AML risk, but the transfer only ever executes after a compliance officer signs off —
there is no confidence threshold or risk score that skips that step. `cd
examples/regulated-approval && agentform validate` succeeds today, with zero setup, including
under `runtime.environment: production`.

## Resource layout

| Collection    | Contents                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`      | `reviewModel` (`openai`/`gpt-5`, pinned `version`, `dataResidency: us`, `fallbacks: [reviewModelFallback]`, `rateLimits`); `reviewModelFallback` (`anthropic`, also pinned).                 |
| `tools`       | `sanctionsScreen` (`http`, `read`); `executeTransfer` (`http`, `destructive`); `auditLog` (`http`, `write`).                                                                                 |
| `agents`      | `paymentReview` — the only agent, tools `[sanctionsScreen]`, memory `caseRecord`.                                                                                                            |
| `memory`      | `caseRecord` — `type: longTerm`, `scope: application`, `retention: 2555d`, `encryption: true`, redacts `accountNumber`.                                                                      |
| `workflows`   | `main` — `paymentReview` (agent) → `complianceApproval` (`humanApproval`, unconditional) → `executeTransfer` → `recordAudit` → `closed`; a `rejected` terminal path if the officer declines. |
| `policies`    | `human-approval-before-transfer`, `no-unpinned-production-models`, `restrict-financial-data-residency` (descriptive references, separate from the 15 built-in `AF0xx` policies).             |
| `evaluations` | `datasets: [tests/transfers.jsonl]`, `thresholds` on `taskSuccess`/`policyViolations`/`maximumAverageCostUsd`.                                                                               |
| `deployment`  | `type: kubernetes`, with `namespace`/`replicas`/`minReadySeconds` in `config`.                                                                                                               |
| `outputs`     | `transferEndpoint` — the payments system's base URL.                                                                                                                                         |

This is the only one of the three examples that sets `runtime.environment: production`
(`government-workflow` and `enterprise-customer-support` both use `staging`), which is a
deliberate choice: it's the one place in this set of examples where two policies that are inert
everywhere else actually engage.

## AF008: production requires evaluation gates

`packages/policy/src/policies/af008-production-requires-evaluation-gates.ts` rejects a
`production`/`prod`-labeled `runtime.environment` (matched case-insensitively — see
`packages/policy/src/production.ts`'s `isProductionEnvironment`) that does not declare **both**
`spec.evaluations.datasets` and `spec.evaluations.thresholds`. `regulated-approval` declares both;
removing either one while `environment: production` stays set reproduces an AF008 failure. This
policy never engages for `government-workflow` or `enterprise-customer-support`, since `staging`
doesn't match the production pattern — both of those still declare a full `evaluations` block
anyway, as a matter of authoring practice, not because a policy requires it at that environment
level.

## AF013: production model aliases must be pinned

`packages/policy/src/policies/af013-production-model-aliases-must-be-pinned.ts` applies the same
production check to every declared model's `version` field. Both `reviewModel` and
`reviewModelFallback` set an explicit `version` (`"2025-04-14"` and `"20250514"` respectively) —
free-form strings, not semantic versions (`packages/schema/src/model.ts`'s `version` field is
`z.string().min(1)`, unlike `metadata.version`, which is the one place `semverSchema` actually
applies). Dropping `version` from either model while `environment: production` stays set
reproduces an AF013 failure — this policy iterates every declared model, including
`reviewModelFallback`, which no agent references directly (it's named only inside
`reviewModel.fallbacks`, an unvalidated string array — nothing cross-checks that a `fallbacks`
entry actually names a declared model, so pinning it is a matter of consistency, not a validator
requirement).

## No bypass, structurally

`paymentReview` has exactly one outgoing edge, and it carries no `when` guard — every request,
regardless of the agent's reported `riskLevel` or `confidence`, reaches `complianceApproval`. The
other two examples both have a genuine branch that skips human review entirely for the "easy" case
(`government-workflow`'s `log-only` path, `enterprise-customer-support`'s `general`/`technical`
paths); this example has none. That is the scenario's whole point — a regulated approval gate that
can be routed around under some condition is not the same control as one that can't — and it's
reflected directly in the edge list, not just the prompt text: `packages/ir/src/semantic/graph.ts`
would flag a second, ungated path into a node calling `executeTransfer` as a fresh AF004 violation
regardless of what any prompt says, since AF004 inspects every `tool` node calling a `destructive`
tool independently.

## A longer-lived memory resource

`caseRecord` differs from the other two examples' memory resources in every dimension:
`scope: application` (not `session`), `retention: 2555d` (~7 years, in the neighborhood of
US broker-dealer recordkeeping retention windows — illustrative, not a citation to a specific
rule), `encryption: true`, and a `redaction: [accountNumber]` list. `government-workflow`'s
`intakeSession` and `enterprise-customer-support`'s `ticketContext` are both short-lived,
session-scoped, and unencrypted by comparison — modeling a single conversation rather than a
retained compliance case file.

## Compile target

`runtime.target` is `langgraph`, for the same structural reason as the other two examples:
`complianceApproval` is a `humanApproval` workflow node, and `packages/adapter-openai/src/
compatibility.ts` does not generate that node type (`agentform compile --target openai` blocks
with `AGF5001`, exit `13`). `agentform compile --target langgraph --cwd
examples/regulated-approval` writes 14 files to `generated/langgraph/` with no blocking
diagnostics.

## Verification

```text
$ agentform validate --cwd examples/regulated-approval
Policy: 15 evaluated — 15 passed, 0 warned, 0 failed, 0 skipped.
Validation succeeded.
$ echo $?
0
```

`--strict` produces the same result. `agentform plan --cwd examples/regulated-approval` also
succeeds (`Policy result: PASSED`), and prints one advisory beyond the plan itself: an `AGF6001`
notice that `agentform test` has never been run against this specification's content hash. That
diagnostic is the evaluation-gate advisory described in `docs/evaluation-reference.md` working as
intended for a production spec with declared evaluation gates — it is informational on `plan`
(unlike the hard AF008/AF013 failures above, it does not block validation or planning) and would
be resolved by actually running `agentform test`, which this walkthrough did not do. See
[`examples/regulated-approval/README.md`](../../examples/regulated-approval/README.md) for the
full scenario description and the exact commands to reproduce all of this.
