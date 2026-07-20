# Agentform planner

## Purpose

`@agentform/planner` compares a desired `AgentformIR` against stored `ResourceState`s (`@agentform/state`), producing an ordered list of `PlanItem`s — what would be created, updated, replaced, or destroyed, with a risk classification for each. `agentform plan` (`docs/cli-reference.md`) is the current consumer.

## Minimal example

```ts
import { comparePlan, createPlanFile, serializePlanFile } from '@agentform/planner';

const items = comparePlan({ ir, currentResourceStates: await backend.listResourceStates() });
const blocking = items.filter((item) => item.requiresApproval);

const planFile = createPlanFile(items, new Date().toISOString());
writeFileSync('plan.afplan', serializePlanFile(planFile));
```

## Desired-resource extraction

`collectDesiredResources(ir)` flattens every model/tool/agent/workflow/memory/output into one list, each with:

- `contentHash` — over the whole resource; differs whenever anything about it changes.
- `identityHash` — over just its identity-defining fields (a tool's `type`, a model's `provider`); differs only when the resource's fundamental kind changes.
- `dependsOn` — other resource addresses it references, covering the primary reference shapes the schema models directly: an agent depends on its model, tools, and memory; a workflow depends on the agents/tools/subworkflows its nodes reference; an agent-type tool depends on its agent; an output depends on whatever `<collection>.<id>` its `value` references (the same convention `@agentform/ir`'s `validateOutputReferences` already checks).

## Comparison and operations

`comparePlan({ ir, currentResourceStates })` classifies each resource address:

| Condition | Operation |
| --- | --- |
| Desired, not in current state | `CREATE` |
| In current state, not desired | `DELETE` |
| Both present, hashes match | `NO_OP` |
| Both present, `contentHash` differs, `identityHash` the same | `UPDATE` |
| Both present, `identityHash` differs | `REPLACE` |

`IMPORT`/`READ` are part of `PlanOperation`'s type (matching §9) but never produced by `comparePlan` — they belong to the future `agentform import` command (Phase 11).

Items are ordered by `orderPlanItems`: non-delete items in forward dependency order (a dependency before whatever depends on it), delete items in reverse (a dependent before whatever it depends on), batched rather than deeply interleaved — see ADR-0008 for why batching is the right level of complexity here.

## Risk classification

`classifyRisk` implements §9's risk table in two tiers — read `packages/planner/src/risk.ts`'s own doc comment for the full reasoning, summarized:

- **Precise**, computed from the desired value alone (always fully available): a newly created tool's `sideEffect` (`read` → `MEDIUM`, `write`/`destructive` → `HIGH`), and a workflow containing a `destructive`-tool call with no `humanApproval` gate (`CRITICAL` — the same structural signal `@agentform/policy`'s `AF004` checks, adapted to the IR).
- **Operation-type baselines**, used wherever a precise §9 rule (a prompt-text change, a model version bump, an expanded network destination, an increased cost ceiling, a data-residency change) would need the resource's *actual previous value* — which `ResourceState` deliberately never stores (§10; see ADR-0008 and `docs/state-reference.md`). `UPDATE` defaults to `MEDIUM` (escalated to `HIGH` for a `model`); `REPLACE` and `DELETE` default to `HIGH` (`DELETE` of a `workflow` is `CRITICAL`, standing in for "removal of human approval" at the coarser grain that's actually determinable).

`requiresApproval` is `true` exactly when `risk === 'CRITICAL'`.

## Plan files

`.afplan` files are tamper-evident JSON: `createPlanFile(items, createdAt)` builds a `PlanFile` with a `contentHash` over `formatVersion`/`createdAt`/`items`, computed with the same canonicalization `@agentform/ir`'s `computeContentHash` already uses. `verifyPlanFile(serialized)` re-parses and recomputes that hash, returning `{ valid: false, error }` (never throwing) for malformed JSON, a shape mismatch, or a hash that no longer matches — the tamper-evidence check. File I/O is deliberately not this package's job (mirrors `@agentform/policy`'s config schema staying fs-free) — `agentform plan --out`/a future `agentform apply plan.afplan` do the actual read/write.

## Scope

- **No field-level diffs.** `PlanItem.changes` is always `[]` today — populating it needs a resource's previous actual value, which the state model deliberately never stores. `reasons` carries a textual explanation instead (e.g. "content hash changed from ... to ...").
- **Risk classification is intentionally approximate for `UPDATE`/`REPLACE`/`DELETE`** — see above. Precise field-triggered rules are a bounded, well-scoped future enhancement once a previous-value (or per-field-hash) snapshot mechanism exists, not implemented now.
- **No dependency extraction beyond the schema's direct reference shapes** — a custom plugin or a future resource kind with references this package doesn't yet know to look for won't contribute a dependency edge until `desired-resources.ts` is extended for it.

## Security implications

- Plan comparison never reads or writes raw resource values from state — see `docs/state-reference.md`.
- Plan file verification is a pure function over the file's own content; a caller (the CLI) is responsible for actually rejecting a plan `verifyPlanFile` reports as invalid before acting on it.
- See `docs/security/threat-model.md` for the full cross-package picture.

## Troubleshooting

- **A resource shows `UPDATE` when you expected `NO_OP`**: the resource's content hash changed. Since field-level diffs aren't available (see Scope), check the resource's full desired value against what you expect it to be — the hash is sensitive to *any* difference, including ones that don't look meaningful from the outside (e.g. whitespace inside `instructions.text`).
- **A resource shows `REPLACE` when you expected `UPDATE`**: its identity fingerprint changed — for a tool, its `type`; for a model, its `provider`. Nothing else currently triggers `REPLACE`.
- **`requiresApproval` is `true` and you don't see why**: check `risk` — it's `CRITICAL` either because a workflow is being deleted, or because a workflow contains a `destructive`-sideEffect tool call with no preceding `humanApproval` node.
