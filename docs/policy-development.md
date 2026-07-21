# Agentform policy development

## Purpose

`docs/policy-reference.md` documents the fifteen policies (`AF001`-`AF015`) `@agentform/policy` ships with today. This guide is for adding a sixteenth: the real `Policy`/`PolicyResult`/`PolicyContext` shapes a check is built from, a full walkthrough of an existing policy as a template, how a new one gets registered, and how the severity-override system in `agentform.policy.yaml` interacts with whatever you choose for it.

`@agentform/policy` has no plugin mechanism for policies — `docs/policy-reference.md`'s own Scope section says so directly: "No custom TypeScript policy plugins, Rego-compatible policies, or organization policy packs — only the fixed built-in catalog." (`docs/plugin-development.md` covers why: `PolicyProvider` is one of `PluginType`'s eight reserved names with no interface behind it yet.) Concretely, this means "writing a new policy" is not installing something external — it's adding a new file to `packages/policy/src/policies/` and registering it in the same fixed array every built-in policy already lives in, `BUILTIN_POLICIES`. The `PolicyDefinition`/`PolicyCheck` types are already the extension point a future, more dynamic phase would build on; today, extending the catalog means editing this codebase directly, the same way the fifteen existing policies were added.

## The `PolicyDefinition` contract

Everything a policy check is built from, from `packages/policy/src/types.ts`:

```ts
export type PolicySeverity = 'error' | 'warning';
export type PolicyResultStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface PolicyContext {
  readonly application: AgenticApplication;
}

export interface PolicyFinding {
  readonly message: string;
  readonly resourceAddress?: string;
  readonly remediation?: string;
}

export type PolicyCheck = (context: PolicyContext) => readonly PolicyFinding[];

export interface PolicyDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultSeverity: PolicySeverity;
  readonly mandatory: boolean;
  readonly check: PolicyCheck;
}
```

`PolicyContext` carries exactly one thing: the already schema-validated `AgenticApplication` (`@agentform/schema`'s `validateAgenticApplication` output). Not the IR, not the filesystem, not deployed state — a `check` function reasons purely over the same shape `@agentform/schema` produces, so it can never observe anything schema validation itself wouldn't have already caught or resolved. A `PolicyCheck` is a pure function: given a context, return the list of violations found, or an empty array if there aren't any. It never throws for "policy violated" — a `PolicyFinding` _is_ how a violation is reported; `check` only throws for a genuine bug.

**A `PolicyFinding` deliberately carries no severity of its own.** This is worth internalizing before writing a `check`: whether a finding becomes a `fail` or a `warn` is decided once, for the whole policy, from its `defaultSeverity` (or a valid override) — never per finding. A `check` that finds three violations in one document produces three `PolicyFinding`s, all judged by the same single effective severity; there's no way (and no need) for one finding to be "worse" than another from inside the check itself.

## Walking through a real policy: AF004

`packages/policy/src/policies/af004-critical-actions-require-human-approval.ts`, in full, is a good template — short, structural, and typical of how a check reasons over the workflow graph rather than a single field:

```ts
import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * A workflow `tool` node that calls a `destructive` tool must have an
 * incoming edge from a `humanApproval` node — i.e. a human has to sign off
 * immediately before the destructive action runs. Checked structurally
 * over the schema-level workflow graph (nodes + edges), not the IR, since
 * PolicyContext only carries the validated `AgenticApplication`.
 */
export const af004CriticalActionsRequireHumanApproval: PolicyDefinition = {
  id: 'AF004',
  name: 'critical-actions-require-human-approval',
  description:
    'Reject destructive tool calls that are not gated by a preceding human approval node.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};

    for (const [workflowId, workflow] of Object.entries(context.application.spec.workflows)) {
      const edges = workflow.edges ?? [];

      for (const [nodeId, node] of Object.entries(workflow.nodes)) {
        if (node.type !== 'tool') {
          continue;
        }
        const tool = tools[node.tool];
        if (!tool || tool.sideEffect !== 'destructive') {
          continue;
        }
        const gatedByApproval = edges.some(
          (edge) => edge.to === nodeId && workflow.nodes[edge.from]?.type === 'humanApproval',
        );
        if (gatedByApproval) {
          continue;
        }
        findings.push({
          message: `Workflow "${workflowId}" node "${nodeId}" calls destructive tool "${node.tool}" without a preceding humanApproval node.`,
          resourceAddress: `spec.workflows.${workflowId}.nodes.${nodeId}`,
          remediation:
            'Add a humanApproval node with an edge into this node before the destructive tool runs.',
        });
      }
    }
    return findings;
  },
};
```

Every element of this is worth copying the shape of, not just the code: `id` is the next unused `AFNNN` (`docs/policy-reference.md`'s table has the current highest); `name` is a kebab-case identifier matching the ID's meaning, used in `PolicyResult.policyName` and in diagnostic messages; `description` is a single, plain-English sentence naming what fails the check, not what passes it; `resourceAddress` on every finding is a dotted schema path built from real loop variables (`spec.workflows.${workflowId}.nodes.${nodeId}`), never a hardcoded string, so a document with multiple violations gets one distinct, locatable finding per violation; `remediation` is one concrete, actionable sentence, not a restatement of the message. `AF001` (`packages/policy/src/policies/af001-no-inline-secrets.ts`) is the other worth reading in full — it scans every string in the entire document (`walkStrings`, `packages/policy/src/walk.ts`) rather than one specific field, useful as a template for a "must not appear anywhere" check the way AF004's is a template for a structural graph check.

## What `evaluatePolicies` turns a `check` into

A policy never computes its own `status` — `evaluatePolicies` (`packages/policy/src/evaluate.ts`) does, from the finding count and the policy's effective severity: zero findings is always `pass`; one or more findings is `fail` if the effective severity is `error`, `warn` if it's `warning`. Every `PolicyResult` `evaluatePolicies` produces has exactly this shape (`types.ts`):

```ts
export interface PolicyResult {
  readonly policyId: string;
  readonly policyName: string;
  readonly status: PolicyResultStatus;
  readonly message: string;
  readonly resourceAddress?: string;
  readonly remediation?: string;
}
```

Note what's _not_ here: there is no `sourceLocation` field on `PolicyResult` today, even though it would be a natural fit alongside `resourceAddress` — the type's own doc comment says so directly: "§16's `PolicyResult` shape exactly — `policyId`/`status`/`message`/`resourceAddress`/`remediation`, plus `sourceLocation` left for a future phase that threads a source map through (schema-level `AgenticApplication` has none today)." `PolicyContext.application` is the schema-validated value, which carries no source-location information at all (that only exists earlier, in `@agentform/parser`'s output) — so there's currently nothing a `check` function could even populate a `sourceLocation` from. Don't add one to a new policy's findings; there's no field for it to go in.

A `check` that reports one finding produces one failing/warning `PolicyResult`; a `check` reporting three findings produces three separate `PolicyResult`s all sharing the same `policyId`/`policyName`/`status` — `results` is one row per _finding_, not one row per policy. This is why, for instance, a document with two models missing a pinned version in production shows two separate `AF013` lines in `agentform validate`'s output, not one.

## Testing convention

Every built-in policy has its own test file, `packages/policy/src/policies/afNNN-*.test.ts`, covering both the violation and the pass case at minimum — `af001-no-inline-secrets.test.ts` also has a dedicated test proving the finding message never echoes the raw secret value it detected, which is exactly the kind of policy-specific guarantee worth its own test beyond "does it fire." Every test builds its `PolicyContext` from `packages/policy/src/test-fixtures.ts`'s `baseApplication()`/`withApplication(mutate)` — a minimal, genuinely schema-valid `AgenticApplication` (built through the real `validateAgenticApplication`, not a hand-typed object cast to the type, so a fixture that drifts out of sync with the schema fails loudly rather than silently asserting past a real shape mismatch) that `withApplication` deep-clones and mutates per test:

```ts
import { af004CriticalActionsRequireHumanApproval } from './af004-critical-actions-require-human-approval.js';
import { withApplication } from '../test-fixtures.js';

it('flags a destructive tool call with no preceding humanApproval node', () => {
  const app = withApplication((application) => {
    // add/mutate application.spec.tools / .workflows here
  });
  const findings = af004CriticalActionsRequireHumanApproval.check({ application: app });
  expect(findings).toHaveLength(1);
});
```

## Registering it into `BUILTIN_POLICIES`

`packages/policy/src/policies/index.ts` is the one place every built-in policy is assembled — both an individual named export and membership in the `BUILTIN_POLICIES` array `@agentform/policy`'s `index.ts` re-exports:

```ts
import { af001NoInlineSecrets } from './af001-no-inline-secrets.js';
// ... one import per policy ...
import { af015GeneratedCodeMustBeReproducible } from './af015-generated-code-must-be-reproducible.js';

export { af001NoInlineSecrets, /* ... */ af015GeneratedCodeMustBeReproducible };

/** Every built-in policy, AF001-AF015, in ID order. */
export const BUILTIN_POLICIES: readonly PolicyDefinition[] = [
  af001NoInlineSecrets,
  // ...
  af015GeneratedCodeMustBeReproducible,
];
```

A new policy needs three additions here: the import, the named re-export, and an entry in `BUILTIN_POLICIES` — kept in ID order, matching `docs/policy-reference.md`'s table. There's no separate registration step anywhere else; `agentform validate`'s policy stage runs literally `evaluatePolicies(BUILTIN_POLICIES, { application })` (`docs/policy-reference.md`'s Minimal example), so appearing in this one array is what makes a new policy actually run.

## Choosing `defaultSeverity` and `mandatory`

`defaultSeverity` is `'error'` for every existing policy except `AF006` (`tools-require-timeouts`, `'warning'`) — a missing timeout is worth flagging but not worth blocking `agentform validate` over by default, unlike (for example) an inline secret. Choose `'warning'` for a check that's genuinely advisory; choose `'error'` for anything that should block `validate`/`plan`/`apply` by default.

`mandatory: true` is what makes a policy's severity actually un-overridable — `evaluatePolicies` rejects any override attempt against a mandatory policy outright, keeping the default severity regardless of what `agentform.policy.yaml` says (see below). Fourteen of the fifteen existing policies are `mandatory: true`; `AF006` is the one exception. Notably, `AF014`/`AF015` — the two placeholder policies that "always pass" because the subsystems they'd actually check (state, the compiler) didn't exist yet when they were written — are still registered `mandatory: true`. Their own doc comments explain why directly: they're marked mandatory now specifically so an override config committed today can't later silently disable them the moment those subsystems exist and the check grows real teeth. Follow the same reasoning for a new policy: mark it `mandatory: true` unless there's a real, stated reason a document author should be able to turn it down to a warning or off entirely (the way `AF006`'s own doc comment explains its choice).

## Severity overrides via `agentform.policy.yaml`

`agentform validate` reads an optional `agentform.policy.yaml` at the project root (`apps/cli/src/lib/policy-config.ts`'s `loadPolicyConfig`, fixed filename, same "found by presence" convention `docs/environment-overlays.md` documents for `environments/<name>.yaml` — deliberately not configurable to a different path, so "mandatory policies cannot be bypassed with CLI flags" stays true with exactly one place overrides can come from):

```yaml
overrides:
  AF006:
    severity: skip
    justification: timeouts enforced at the gateway layer
```

validated against `policyEngineConfigSchema` (`packages/policy/src/config-schema.ts`) — `severity` is `'error' | 'warning' | 'skip'`, `justification` an optional non-empty string. `evaluatePolicies` (`packages/policy/src/evaluate.ts`) applies three rules, in this order, to any policy an override names:

1. **A mandatory policy's severity can never change.** `policy.mandatory && override.severity !== policy.defaultSeverity` is rejected outright — diagnostic `AGF4001`, default severity kept, no exceptions regardless of what `justification` says.
2. **A non-mandatory override that _weakens_ severity** (`error`→`warning`, `error`→`skip`, `warning`→`skip`, computed by comparing a fixed rank — `error: 2`, `warning: 1`, `skip: 0`) **requires a non-empty `justification`.** Without one: diagnostic `AGF4002`, default severity kept.
3. **Tightening** (`warning`→`error`) **or leaving severity unchanged always applies**, `justification` or not.

An override naming a policy ID `BUILTIN_POLICIES` doesn't contain at all is `AGF4003`; a config file that exists but doesn't parse as YAML/JSON or doesn't match `policyEngineConfigSchema`'s shape is `AGF4004` — both are diagnostics about the _override configuration itself_ (`EvaluatePoliciesResult.diagnostics`), kept entirely separate from `results` (the actual pass/warn/fail/skip outcomes), so a rejected override never silently looks like a policy that simply passed. `severity: skip` short-circuits the policy entirely — its `check` function is never even called, so a skipped policy is cheap, not just suppressed after running.

## Redaction discipline

If a new policy's `check` might ever surface something secret-shaped in a finding's `message` (the way `AF001` deliberately does — flagging exactly what looks like a credential), route it through `redactSecretValue` (`packages/policy/src/redact.ts`) before putting it in the message, the same way `AF001` does:

```ts
findings.push({
  message: `Value at "${pathToAddress(path)}" looks like an inline ${match.name}: ${redactSecretValue(value)}`,
  resourceAddress: pathToAddress(path),
  remediation: 'Replace the inline credential with a reference ... instead of a literal value.',
});
```

A finding's `message` ends up in console output, `--json` output, and diagnostics — anywhere a raw secret value could leak from a validation run, `redactSecretValue` is the one function this codebase relies on structurally to prevent it (`docs/policy-reference.md`'s Redaction section, `docs/security/threat-model.md`'s "Secret leakage" entry). Most new policies won't need this at all — it only matters if a `check` is reporting back a literal value from the document rather than just naming a field that's missing or malformed.

## Scope

- **No dynamic policy plugins.** A new policy is a source-code change to `@agentform/policy` itself, registered in the fixed `BUILTIN_POLICIES` array — see Purpose, above, and `docs/plugin-development.md`'s note on `PolicyProvider` being a reserved, unimplemented `PluginType`.
- **A `check` only ever sees the schema-validated `AgenticApplication`** — no IR, no deployed state, no filesystem, no source locations. A check that needs information only the IR or deployed state has (e.g., something about a resolved dependency graph, or what's actually applied) can't be expressed as a policy today; `docs/policy-reference.md`'s Scope section notes only the first of §6.7's five evaluation stages (source validation) exists.
- **A `PolicyFinding` carries no severity of its own** — every finding a `check` returns is judged by that policy's single effective severity. There's no way to make one finding from the same policy more or less severe than another.
- **No enforcement beyond the structural document check itself.** A policy like `AF002` (no unrestricted shell tools) can flag that a tool _declares_ itself capable of something; it cannot observe or block what a tool actually _does_ at execution time, since no such runtime exists yet.

## Security implications

- **Mandatory cannot be bypassed, and this is enforced in `evaluatePolicies` itself, not by any caller's discipline** — see rule 1 above. Marking a new policy `mandatory: true` is a real, structural guarantee, not documentation-only advice.
- Route any finding message that might contain something secret-shaped through `redactSecretValue` — see Redaction discipline, above. This is the one place a poorly-written new policy could reintroduce the exact leak `AF001` exists to prevent.
- A skipped policy (`severity: skip`, only reachable for a non-mandatory policy with a justified override) still produces a `PolicyResult` with `status: 'skip'` — it is never silently absent from `results`, so tooling reading the full results array can always tell "checked and skipped" apart from "not registered at all."
- See `docs/security/threat-model.md` for how the policy engine's protections fit into the full cross-package picture.

## Troubleshooting

- **My new policy never runs**: check it's actually added to `BUILTIN_POLICIES` in `packages/policy/src/policies/index.ts` — a `PolicyDefinition` that exists as a file and an export but isn't in that array is never passed to `evaluatePolicies` by anything.
- **An override for my new policy is silently ignored**: check `EvaluatePoliciesResult.diagnostics`, not `results` — a rejected override (`AGF4001` mandatory, `AGF4002` missing justification, `AGF4003` unknown policy ID, `AGF4004` malformed config file) shows up there, never as part of the policy's own pass/warn/fail outcome.
- **I marked my policy `mandatory: true` but want to test that overrides are actually rejected**: write the same kind of test `af014`/`af015` have — assert `.mandatory` is `true` directly, and separately exercise `evaluatePolicies` with an override attempting to change it, asserting the diagnostic code and that the default severity was kept.
- **My finding's `resourceAddress` doesn't match what `agentform inspect`'s address format looks like**: that's expected — a `PolicyFinding.resourceAddress` is a full schema-level dotted path (`spec.workflows.main.nodes.approve`), not the `<kind>.<id>` short address `agentform inspect` accepts (`docs/cli-reference.md`'s `agentform inspect` section) — the two are deliberately different things pointing at related but not identical locations.
- **I need my check to know where in the source file a value came from**: it can't — `PolicyContext` carries only the schema-validated `AgenticApplication`, which has no source-location information at all. See What `evaluatePolicies` turns a `check` into, above, for why `PolicyResult` has no `sourceLocation` field to populate even if it did.
