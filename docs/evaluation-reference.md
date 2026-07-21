# Agentform evaluation engine

## Purpose

`@agentform/runtime` and `@agentform/evaluator` implement §17's evaluation engine: given an `AgentformIR` (`docs/ir-reference.md`) and a dataset of test cases, run each one against a deterministic, fully offline mock execution of the workflow graph, then check a vocabulary of structural assertions against what actually happened. `agentform test` (`docs/cli-reference.md`) is the current consumer; `agentform plan`/`agentform status` separately read back whether a passing run exists for the specification as it stands right now.

## Minimal example

A `.jsonl` dataset is one JSON object per line — shown here across multiple lines only for readability; `tests/basic.jsonl` would contain this as a single line:

```text
{"name":"duplicate complaints are not recreated","workflow":"main","input":{"locationId":"LOC-101"},"mocks":{"complaint-registry-search":{"return":{"duplicateFound":true}}},"nodes":{"intake":{"toolCalls":[{"tool":"complaint-registry-search","args":{"locationId":"LOC-101"}}]}},"assertions":[{"type":"toolCalled","tool":"complaint-registry-search"},{"type":"toolNotCalled","tool":"complaint-registry-create"},{"type":"terminationReason","equals":"duplicate-found"}]}
```

The same test case, pretty-printed for reference:

```json
{
  "name": "duplicate complaints are not recreated",
  "workflow": "main",
  "input": { "locationId": "LOC-101" },
  "mocks": { "complaint-registry-search": { "return": { "duplicateFound": true } } },
  "nodes": {
    "intake": {
      "toolCalls": [{ "tool": "complaint-registry-search", "args": { "locationId": "LOC-101" } }]
    }
  },
  "assertions": [
    { "type": "toolCalled", "tool": "complaint-registry-search" },
    { "type": "toolNotCalled", "tool": "complaint-registry-create" },
    { "type": "terminationReason", "equals": "duplicate-found" }
  ]
}
```

```ts
import { loadDatasets, runDataset } from '@agentform/evaluator';
import { nodeFileSystem } from '@agentform/parser';

const testCases = loadDatasets(nodeFileSystem, rootDir, ir.evaluations?.datasets ?? []);
const results = runDataset(ir, testCases, { policyPassed: true });
const allPassed = results.every((r) => r.passed);
```

## Deterministic mock execution engine (`@agentform/runtime`)

`runWorkflow(ir, scenario)` walks the **real** IR workflow graph node by node — the same graph `@agentform/ir`'s semantic validation already checked for reachability and structural soundness — but never calls a real model, tool, or API. Every effect is driven by the test case's own `mocks`/`nodes` overrides:

| Node type                                     | Behavior                                                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`/`tool`                                | Executes any `toolCalls` the scenario declares for that node (`nodes.<id>.toolCalls`), recording each into the trace. Retries use the agent's real, declared `retry.maxAttempts` — a mock's `failCount` says how many attempts fail first.           |
| `humanApproval`                               | Uses the scenario's `nodes.<id>.approve` (default `true`), recording an `ApprovalRequestRecord`.                                                                                                                                                     |
| `terminate`                                   | Ends the run, recording the node's own `reason` (or `'terminate'` if it declares none) as `terminationReason`.                                                                                                                                       |
| `subworkflow`                                 | Recurses into the referenced workflow with the same scenario, merging its trace into the parent's.                                                                                                                                                   |
| `router`/`condition`                          | Requires `nodes.<id>.next` whenever the node has more than one outgoing edge — real IR semantic validation (`AGF3009`) already guarantees at most one edge is unconditional, so a genuine branch always needs the scenario to say which way it goes. |
| `parallel`/`join`/`delay`/`event`/`transform` | Pass-through: recorded as visited, no branching decision to make.                                                                                                                                                                                    |
| `loop`                                        | Bounded by the node's real, declared `maxIterations` — a scenario that never redirects away from a self-loop still terminates once that visit count is reached, the same safety valve a real deployment would have.                                  |

No expression evaluator exists anywhere in Agentform (by design — every framework adapter also generates a `when`-condition stub for a human to fill in; see `docs/compiler-reference.md`), so a `when:` string on an edge is never evaluated for real. It only satisfies `AGF3009`'s "at most one unconditional edge" structural rule; the scenario's `nodes.<id>.next` is what actually decides branch/loop routing during a test run.

## Assertion vocabulary

`Assertion` (`@agentform/evaluator`) is a Zod discriminated union of 16 types, evaluated purely and synchronously against an `ExecutionTrace` by `evaluateAssertion`/`evaluateAssertions`:

| Type                | Checks                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `exactMatch`        | A dot-path into `finalOutput` equals a given value.                                                                                 |
| `jsonSchemaValid`   | `finalOutput` (or a sub-path of it) validates against a given JSON Schema (via `ajv`).                                              |
| `toolCalled`        | A named tool was called at least once.                                                                                              |
| `toolNotCalled`     | A named tool was never called.                                                                                                      |
| `toolArgumentMatch` | Some call to a named tool had a given argument equal to a given value.                                                              |
| `workflowPath`      | The exact ordered sequence of visited nodes equals a given array.                                                                   |
| `nodeVisited`       | A named node was visited at least once.                                                                                             |
| `nodeNotVisited`    | A named node was never visited.                                                                                                     |
| `maximumToolCalls`  | Total tool calls (or calls to one named tool) stay at or under a limit.                                                             |
| `maximumRetries`    | The run's total retry count stays at or under a limit.                                                                              |
| `maximumCost`       | `trace.costUsd` stays at or under a limit.                                                                                          |
| `maximumLatency`    | `trace.latencyMs` stays at or under a limit, given as a duration string (`"30s"`, parsed by `@agentform/core`'s `parseDurationMs`). |
| `policyResult`      | The policy evaluation supplied via `EvaluationContext.policyPassed` matches an expected pass/fail.                                  |
| `approvalRequested` | A human-approval node (or a specific one) requested approval.                                                                       |
| `terminationReason` | The run's `terminationReason` equals a given value.                                                                                 |
| `fieldRange`        | A numeric dot-path into `finalOutput` falls within a given `[min, max]`.                                                            |

`toolCalled`/`toolNotCalled`/`toolArgumentMatch`/`maximumToolCalls`/`maximumRetries`/`maximumCost`/`maximumLatency`/`policyResult`/`approvalRequested`/`terminationReason`/`exactMatch`/`jsonSchemaValid`/`workflowPath`/`nodeVisited` are Phase 10's own 14-item "minimum evaluators" checklist; `nodeNotVisited`/`fieldRange` are real §17/§6.8 vocabulary ("Node not visited", "Output field range") that checklist happens to drop — included since they're natural, cheap complements to `nodeVisited`/`exactMatch` that directly serve the spec's fuller intent (see the doc comment on `packages/evaluator/src/assertion.ts`).

## Dataset format

A dataset file (referenced by `spec.evaluations.datasets`) is loaded by `loadDatasetFile`/`loadDatasets`, resolved through the same `resolvePathWithinRoot` sandbox every other file reference uses:

- **`.jsonl`** — one JSON test case per line (§17's own example format).
- **`.json`/`.yaml`/`.yml`** — either a bare top-level array of test cases, or an object with a `tests:` array (§17's inline `tests:` YAML block shape).

Each test case (`TestCase`, Zod-validated by `testCaseSchema`):

```ts
{
  name: string;
  workflow: string;                              // which spec.workflows entry to run
  input?: Record<string, unknown>;
  mocks?: Record<string, MockToolResult>;         // tool name -> { return?, error?, failCount?, costUsd?, latencyMs? }
  nodes?: Record<string, ScenarioNodeOverride>;    // node id -> { next?, toolCalls?, approve?, output? }
  maxSteps?: number;
  assertions: Assertion[];                         // at least one
}
```

`runTestCase(ir, testCase, context?)` runs it and evaluates every assertion, returning `{ name, workflow, passed, assertionResults, trace, error? }` — an unknown `workflow` reference or a runtime error is reported as a failed result with `error` set, never a thrown exception (so one bad test case in a dataset doesn't abort the rest). `runDataset` runs every case independently and returns every result.

## Threshold gates

`spec.evaluations.thresholds` is a free-form `Record<string, number>` at the schema level, but `evaluateThresholds` (`@agentform/evaluator`) only actively gates the three keys the build spec's own canonical example uses:

| Key                     | Gates                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `taskSuccess`           | Minimum pass rate (`passedTests / totalTests`), gate is `≥`.  |
| `policyViolations`      | Maximum count of failing built-in policy checks, gate is `≤`. |
| `maximumAverageCostUsd` | Maximum mean `costUsd` per test case, gate is `≤`.            |

An unrecognized key is reported with `recognized: false` (never silently dropped — §12's "do not silently ignore" line applies here too) but does not block the overall gate on its own; `agentform test`'s console output lists it as "unrecognized threshold key — not gated" so the author can see their typo or unsupported key rather than have it be quietly ineffective.

## Reports

`agentform test` supports three output shapes, sharing the same `TestCaseResult[]`:

- **Console** (`formatTestResultsForHumans`) — a `PASS`/`FAIL` line per case, failing assertion messages indented underneath, a pass-rate summary line, and a threshold section when any are declared.
- **`--json`** — the full `results`/`thresholds`/`policyDiagnostics` arrays.
- **`--junit <file>`** (`formatJUnitXml`) — a standard `<testsuites><testsuite><testcase>` document any CI dashboard already knows how to render.

All three go through `redactSecretsFromReport` before being written anywhere — see Security implications below.

## Tamper-evident results record and gate status

Every `agentform test` run (pass or fail) writes `.agentform/test-results.json` — `TestResultsRecord` (`@agentform/evaluator`), mirroring `@agentform/planner`'s `.afplan` design exactly: a `contentHash` computed over the rest of the record via the same canonicalization `@agentform/ir`'s `computeContentHash` uses. `parseTestResultsRecord` re-parses and re-checks that hash, returning `{ valid: false, error }` (never throwing) for malformed JSON, a shape mismatch, or an edited file.

`checkEvaluationGateStatus(currentIrHash, resultsFile)` is a pure function comparing that record's `irHash` against the specification's current `contentHash`, classifying the gate as:

- **`never-run`** — no results file exists, or it's invalid/tampered (treated the same as absent, since its content can't be trusted).
- **`stale`** — a valid record exists, but for an earlier version of the specification.
- **`failed`** — the record matches the current specification but `success` is `false`.
- **`passed`** — the record matches the current specification and `success` is `true`.

This function has no opinion on "production" — deciding whether the status matters is the caller's job. `agentform plan` and `agentform status` both call it (via `apps/cli/src/lib/evaluation-gate-output.ts` for `plan`'s diagnostics), each independently deciding when to surface it: `plan` only for a production `runtime.environment` that also declares at least one dataset or threshold (`AGF6001`/`AGF6002`/`AGF6003`, always `warning` severity — see `docs/cli-reference.md`); `status` reports it unconditionally as part of its read-only summary, or `"not applicable"` when nothing is declared to run.

## Scope

- **No live-provider execution.** `agentform test --live` is rejected immediately (exit 2) with a clear message — there is no credential-loading or real API-calling infrastructure anywhere in Agentform yet (`@agentform/secrets-env` is still an unimplemented skeleton). Implementing this is a substantially larger, separate undertaking than the deterministic engine, deferred rather than half-built.
- **No real expression evaluator**, by design — see above. A `when:` string is structural-only everywhere in Agentform, not just here.
- **Only three threshold keys are actively gated** — see Threshold gates above. `evaluations.thresholds` remains schema-open to any key for forward compatibility, but only `taskSuccess`/`policyViolations`/`maximumAverageCostUsd` currently do anything.
- **Evaluation gates are advisory, not blocking, as of Phase 10.** `agentform plan`'s `AGF6xxx` diagnostics are always warnings — there is no `agentform apply` yet (Phase 11) to actually refuse a deployment over a stale or failed gate, so nothing can be "blocking" today. §17's "failed evaluation gates block production apply" acceptance criterion is expected to become real once `apply` exists and reads this same gate status at `error` severity.
- **"Adapter-generated smoke tests"** (one of Phase 10's stated objectives) is satisfied by what Phase 8/9 already built, not by new work in this phase: every framework adapter's generated project is verified against its real toolchain (`pip`, `dotnet build`, real script execution — see each adapter's `adapter.test.ts`), and `apps/cli/src/cross-target.test.ts` compiles one portable specification against all six adapters. Phase 10 does not additionally translate evaluation datasets into framework-native test files embedded in a generated project — that would be a new code-generation capability beyond what `@agentform/evaluator`/`@agentform/runtime` (this phase's only required packages) imply, and nothing else in the build spec's Phase 10 section (CLI flags, acceptance criteria) points at it.

## Security implications

- The mock execution engine never calls a real model, tool, HTTP endpoint, or subprocess — every "effect" in a run is data the test author already declared in the scenario. A hostile dataset file cannot use `agentform test` as a way to reach a real system.
- Dataset files are loaded through the same `resolvePathWithinRoot` sandbox as every other file reference — a dataset path cannot escape the project root (`docs/security/threat-model.md`).
- `.agentform/test-results.json` is tamper-evident the same way a `.afplan` file is (`docs/planner-reference.md`); an edited record is detected by `parseTestResultsRecord`, never trusted silently.
- `redactSecretsFromReport` (`apps/cli/src/lib/report-redaction.ts`) runs every rendered report — console, `--json`, `--junit` — through the same `SECRET_PATTERNS`/`redactSecretValue` `@agentform/policy`'s `AF001` uses, before it's printed or written to disk. This exists specifically because dataset content (a mocked tool's `args`/`return`, echoed back verbatim in a failing assertion's message) is author-controlled test-fixture content the specification-level `AF001` check never sees.

## Troubleshooting

- **`agentform test` exits 4/5/6 instead of running tests**: the pipeline failed before evaluation ever started (schema/semantic/policy) — the same exit codes `agentform validate` would produce for the same underlying problem. Fix the specification first.
- **A branching or looping test case throws instead of producing a `FAIL` result**: it's missing a `nodes.<id>.next` override for a node with more than one outgoing edge — every genuine branch needs the scenario to say which way it goes (see Deterministic mock execution engine above).
- **A threshold you declared doesn't seem to do anything**: check the console output for "unrecognized threshold key — not gated" — only `taskSuccess`/`policyViolations`/`maximumAverageCostUsd` are currently gated (see Threshold gates above).
- **`agentform plan`/`agentform status` says evaluation gates are stale, but you just ran `agentform test`**: the specification changed (even a whitespace-insensitive but hash-sensitive change, e.g. instruction text) after that run — the recorded `irHash` no longer matches. Re-run `agentform test`.
- **You expected `agentform plan` to warn about evaluation gates, but it's silent**: `AGF6xxx` only fires for a production-labeled `runtime.environment` (`isProductionEnvironment`) that also declares at least one dataset or threshold — a non-production environment, or a production one declaring no evaluations at all (which `AF008` already flags as a policy error), stays silent by design.
