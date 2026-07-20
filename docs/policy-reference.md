# Agentform policy engine

## Purpose

`@agentform/policy` evaluates a schema-validated `AgenticApplication` (the same type `@agentform/schema`'s `validateAgenticApplication` produces — no IR, no filesystem, no execution) against a catalog of built-in policies, producing a `PolicyResult` per policy: `pass`, `warn`, `fail`, or `skip`. `agentform validate` (`docs/cli-reference.md`) is the only current consumer, running it once parsing/schema/semantic validation all succeed.

## Minimal example

```ts
import { evaluatePolicies, BUILTIN_POLICIES } from '@agentform/policy';
import { validateAgenticApplication } from '@agentform/schema';

const { data: application } = validateAgenticApplication(parsedDocument);
const { results, diagnostics } = evaluatePolicies(BUILTIN_POLICIES, { application });

results.filter((r) => r.status === 'fail'); // blocking violations
diagnostics; // problems with the override config itself, not with the document
```

## The policy catalog

Every policy from §16, all registered in `BUILTIN_POLICIES` (`packages/policy/src/policies/index.ts`):

| ID      | Name                                              | Default severity | Mandatory | What it checks |
| ------- | -------------------------------------------------- | ----------------- | --------- | --------------- |
| `AF001` | `no-inline-secrets`                                | error              | yes       | No string anywhere in the document matches a known credential shape (AWS/GitHub/Slack/OpenAI-style keys, PEM blocks, inline bearer tokens). |
| `AF002` | `no-unrestricted-shell-tools`                      | error              | yes       | A `function`/`customPlugin`/`mcp` tool whose handler/plugin/operation name suggests shell execution declares explicit `permissions`. |
| `AF003` | `write-tools-require-explicit-permission`          | error              | yes       | A tool with `sideEffect: write` or `destructive` declares `permissions`. |
| `AF004` | `critical-actions-require-human-approval`          | error              | yes       | A workflow `tool` node calling a `destructive` tool has an incoming edge from a `humanApproval` node. |
| `AF005` | `workflow-loops-require-limits`                    | error              | yes       | Every `loop` node has a positive, finite `maxIterations` — schema-guaranteed already; this is defense in depth. |
| `AF006` | `tools-require-timeouts`                           | **warning**        | no        | Every tool declares a `timeout`. |
| `AF007` | `models-require-explicit-provider`                 | error              | yes       | A model's `provider` is non-blank after trimming (closes a gap `z.string().min(1)` leaves open for a whitespace-only value). |
| `AF008` | `production-requires-evaluation-gates`             | error              | yes       | A `production`/`prod` runtime environment declares both `evaluations.datasets` and `evaluations.thresholds`. |
| `AF009` | `sensitive-data-requires-residency`                | error              | yes       | An agent using a `confidential`/`restricted`-classified tool has a model with `dataResidency` set. |
| `AF010` | `prompt-recording-disabled-for-restricted-data`    | error              | yes       | `observability.recordPrompts` isn't `true` while a `restricted`-classified tool exists in the document. |
| `AF011` | `destructive-tools-require-idempotency-strategy`   | error              | yes       | A `destructive` tool declares a non-blank `idempotencyStrategy`. |
| `AF012` | `network-destinations-must-be-allowlisted`         | error              | yes       | An `http`/`openapi` tool declares `networkDestination` explicitly (see Scope below for what this doesn't cover yet). |
| `AF013` | `production-model-aliases-must-be-pinned`          | error              | yes       | In a production runtime environment, every model declares a non-blank `version`. |
| `AF014` | `state-must-not-contain-secrets`                   | error              | yes       | **Placeholder** — always passes; no state engine exists until Phase 7. |
| `AF015` | `generated-code-must-be-reproducible`              | error              | yes       | **Placeholder** — always passes; no compiler exists until Phase 8. |

Every policy's `check` function lives in its own file (`packages/policy/src/policies/afNNN-*.ts`), each with its own test file covering both the violation and pass cases.

## Evaluation semantics

`evaluatePolicies(policies, context, config?)` runs every policy's `check(context)` and turns the findings into `PolicyResult`s, applying `config.overrides` under three rules (§16, Phase 6 acceptance criteria):

1. **A mandatory policy's severity can never change.** An override attempting it is rejected (`AGF4001`) and the default severity is kept, regardless of what the override says.
2. **A non-mandatory override that *weakens* severity** (`error`→`warning`, `error`→`skip`, `warning`→`skip`) **requires a non-empty `justification`.** Without one, the override is rejected (`AGF4002`) and the default severity is kept.
3. **Tightening severity** (`warning`→`error`) **or leaving it unchanged always applies**, justification or not.

`skip` short-circuits the policy entirely — its `check` never runs. An override referencing an unknown policy ID is flagged (`AGF4003`) rather than silently ignored. `hasPolicyFailures(results)` is the one-line predicate for "should this block."

A policy's own `check` never reports its own severity — it returns `PolicyFinding`s (message/resourceAddress/remediation only). The *policy's* effective severity (default or validly overridden) is what turns "zero findings" into `pass` and "one or more findings" into `warn` or `fail`. This keeps severity single-sourced: a policy has exactly one effective severity, not one nominally on the policy and a conflicting one per-finding.

## Configuration file

`agentform validate` reads an optional `agentform.policy.yaml` at the project root (`apps/cli/src/lib/policy-config.ts`), validated against `@agentform/policy`'s own `policyEngineConfigSchema`:

```yaml
overrides:
  AF006:
    severity: skip
    justification: timeouts enforced at the gateway layer
```

Absent entirely means no overrides — every policy runs at its built-in default. Present but malformed (bad YAML, wrong shape, invalid severity value) is a blocking diagnostic (`AGF4004`), not a silent fallback — the config's own validity matters. See `docs/cli-reference.md`'s `validate` section for the full CLI-level behavior, including why there is deliberately no flag to point at a different config file.

## Redaction

`redactSecretValue(value)` masks a detected-secret-looking value to its length and first/last two characters (capped middle-section length), used by `AF001` so a "found a secret" message can never itself become a place the secret leaks into logs, diagnostics, or test snapshots (§18, §30).

## Scope

What this package does **not** do, as of Phase 6:

- **No custom TypeScript policy plugins, Rego-compatible policies, or organization policy packs** (§6.7) — only the fixed built-in catalog. The `PolicyDefinition`/`PolicyCheck` types are already the extension point a future phase would build on.
- **`AF012` checks declaration, not enforcement.** There is no organization-level network allowlist registry to check a tool's `networkDestination` *against* yet, and no HTTP-tool runtime to enforce it at request time — the policy only ensures the destination is stated explicitly rather than left unconstrained.
- **`AF014`/`AF015` are honest placeholders**, not real checks — there is nothing yet for them to inspect (no state engine, no compiler). They're registered now, as mandatory, specifically so an override config committed today can't later disable them the moment those subsystems exist.
- **No runtime enforcement of anything** — every check here is structural, over the source document. Whether a `function` tool flagged by `AF002` actually *runs* a destructive shell command, whether a `humanApproval` gate is actually honored at execution time — none of that exists to check yet; it's adapter/runtime-phase scope (Phase 8+).
- **Evaluation stages beyond source validation** (§6.7 lists five: source, plan, pre-apply, runtime, drift) — only the first exists today. The same `evaluatePolicies` function is designed to be reusable once plan/apply/drift artifacts exist to build a `PolicyContext` from.

## Security implications

- Findings never echo raw secret values — see Redaction above.
- Mandatory policies cannot be bypassed by configuration, no matter what an override claims — enforced structurally in `evaluatePolicies`, not by convention.
- See `docs/security/threat-model.md` for how this package's protections fit into the full picture across every package.

## Troubleshooting

- **A policy result I expected to see is missing from `results`**: check whether it was configured to `skip` in `agentform.policy.yaml` — a skipped policy's `check` never runs, so it produces exactly one `status: 'skip'` result and nothing else, rather than being silently absent.
- **My override didn't take effect and there's no obvious error**: `evaluatePolicies`'s `diagnostics` array (separate from `results`) is where a rejected override shows up (`AGF4001`/`AGF4002`/`AGF4003`) — check there, not `results`.
- **`AF014`/`AF015` always show `pass` no matter what I do**: expected — see Scope above. They aren't broken; there's nothing for them to check yet.
