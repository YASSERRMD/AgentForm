# Regulated approval: outbound wire-transfer review

An outbound wire-transfer workflow for a regulated financial-services setting. An agent screens
every transfer request for sanctions/AML risk, but — regardless of amount, risk score, or
confidence — the transfer cannot execute until a compliance officer explicitly approves it. There
is no auto-approve path; that omission is the point of this example, not an oversight.

See [`docs/examples/regulated-approval.md`](../../docs/examples/regulated-approval.md) for a full
walkthrough of the design decisions below.

## Scenario

`paymentReview` (`spec.agents.paymentReview`) runs `sanctionsScreen` against the beneficiary and
returns a structured `riskLevel`, `screeningResult`, and `confidence`
(`paymentReview.outputSchema`). Its rationale is written for a reviewer, not as a decision: the
prompt (`prompts/review.md`) is explicit that the agent's output "does not authorize anything by
itself."

The workflow (`spec.workflows.main`) has exactly one edge out of `paymentReview`, and it is
unconditional: every reviewed request goes to `complianceApproval`, a `humanApproval` node
assigned to `compliance-officer`. Only `approved` reaches `executeTransfer`
(`sideEffect: destructive`); `rejected` terminates at `rejected` with no funds moved. A successful
transfer always continues to `recordAudit` (`auditLog.create`, `sideEffect: write`) before
terminating at `closed` — the audit entry is not optional and not something the agent decides to
skip.

## What this demonstrates

This is the one example of the three that runs `runtime.environment: production`, which turns on
two policies the other two examples never trigger (both `staging`):

- **AF008 (production requires evaluation gates)**: `spec.evaluations` declares both `datasets`
  and `thresholds`, which is mandatory once `environment` reads as production — an evaluation
  block with one but not the other fails validation the same as having none at all.
- **AF013 (production model aliases must be pinned)**: both declared models —
  `reviewModel` and its `fallbacks` entry `reviewModelFallback` — set an explicit `version`, not
  just a provider/model pair. An unpinned model alias in a production spec is a validation error
  under this policy, not a warning.

Beyond those two:

- **No bypass, by construction, not by convention**: unlike the other two examples, there is no
  confidence- or amount-based branch that skips `humanApproval`. The single unconditional edge
  from `paymentReview` to `complianceApproval` is the whole enforcement mechanism — read
  literally, the graph cannot reach `executeTransfer` any other way (`validateWorkflowGraph` in
  `packages/ir/src/semantic/graph.ts` would refuse to validate a second, ungated path to a
  `destructive` tool node under AF004 regardless).
- **Long-term, encrypted, redacted memory**: `spec.memory.caseRecord` is `type: longTerm`, `scope:
application`, `retention: 2555d` (~7 years, matching typical financial recordkeeping retention),
  `encryption: true`, and redacts `accountNumber` — modeling a compliance case file rather than a
  short-lived conversation.
- **A fallback model with rate limits**: `reviewModel.fallbacks` names `reviewModelFallback` (a
  different provider entirely — `anthropic` vs. `openai`), and `reviewModel.rateLimits` caps
  requests/tokens per minute.
- **`deployment`**: a `kubernetes` deployment block (`namespace`, `replicas`, `minReadySeconds`) —
  the one example of the three that fills in this optional section.

## Try it

```bash
agentform validate --cwd examples/regulated-approval
agentform graph --cwd examples/regulated-approval
agentform plan --cwd examples/regulated-approval
agentform compile --target langgraph --cwd examples/regulated-approval
```

No environment variables are required — every external endpoint uses a literal placeholder base
URL so `agentform validate` succeeds with zero setup.

## Verified

- `agentform validate --cwd examples/regulated-approval` — exit `0`, `Validation succeeded.`,
  15/15 built-in policies pass (also holds under `--strict`).
- `agentform compile --target langgraph --cwd examples/regulated-approval` — exit `0`, wrote 14
  files to `generated/langgraph/`.
- `agentform compile --target openai` is blocked for the same structural reason as the other two
  examples: `complianceApproval` is a `humanApproval` workflow node, which the OpenAI adapter does
  not generate. LangGraph natively supports `humanApproval` alongside `tool`
  (`packages/adapter-langgraph/src/compatibility.ts`), which is why `runtime.target` is
  `langgraph`.
- `agentform plan --cwd examples/regulated-approval` — exit `0`, `Policy result: PASSED`, and
  (because this is the one example with `environment: production` and a real
  `spec.evaluations` block) it also prints an `AGF6001` advisory: `A production environment
declares evaluation gates, but agentform test has never been run (or its results file is
missing/invalid).` That warning is the evaluation-gate advisory working as intended
  (`docs/evaluation-reference.md`), not a defect in this spec — it goes away once `agentform test`
  has produced a results file for this project's content hash.

## Uncertain / worth double-checking

The `tests/transfers.jsonl` dataset is illustrative in the same way as the other two examples' —
shaped to match `packages/evaluator/src/test-case.ts`, but not run end to end through
`agentform test` as part of this exercise.
