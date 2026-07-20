# ADR-0003: Schema versioning

## Status

Accepted

## Context

The Agentform specification (`apiVersion: agentform.dev/v1alpha1`) is the contract every downstream stage — semantic validation, the IR, the planner, six framework adapters — builds on. It needs a versioning scheme from the very first schema commit, not bolted on later, because `apiVersion` is itself a required, validated field (§6.1/§7) and changing its meaning after the fact would be a breaking change to every existing specification file. Separately, the spec requires _both_ a Zod schema (for runtime validation with good error messages) and a generated JSON Schema (§5 "Validation": "The Zod schema and generated JSON Schema must remain synchronized through tests") — those need to agree by construction, not by manual maintenance.

## Decision

- **`apiVersion` is a fixed literal per schema version** (`z.literal('agentform.dev/v1alpha1')`), not a semver range or open string. A document with any other `apiVersion` value fails validation with a single, unambiguous diagnostic rather than being coerced or partially accepted. Introducing `v1beta1`/`v1` later means adding a _new_ schema module and literal, not mutating this one — old documents keep validating against the version they declared.
- **Zod is the single source of truth; JSON Schema is generated, never hand-edited.** `packages/schema/src/json-schema.ts` calls `z.toJSONSchema()` on the same schema objects `validateAgenticApplication` uses. `pnpm --filter @agentform/schema generate:json-schema` regenerates the committed `specifications/v1alpha1/agentic-application.schema.json`, and CI fails if regenerating produces a diff (enforced by both a CI step and `json-schema.test.ts`'s parity test against the committed file) — so the two representations cannot silently drift apart.
- **Every schema object is closed (`.strict()`).** An unrecognized key is a validation error, not a silently-ignored field. This is deliberate given §30's "Do not silently ignore unsupported properties" and §3.6's reproducibility goal — a typo'd or forward-looking field should fail loudly in `v1alpha1`, not disappear.
- **Resource-map keys are constrained identifiers** (`identifierSchema`: starts with a letter, then letters/digits/`_`/`-`), consistently across models, tools, agents, workflows, workflow nodes, and policy references. This is a schema-wide, not per-resource, decision — it keeps names safe to reuse as file names, environment-variable fragments, and generated-code symbols in the compiler (Phase 8+).
- **Sections of the spec that are intentionally open-ended right now stay minimal rather than guessed at.** `spec.evaluations` only models `datasets`/`thresholds` (matching the one example the build spec gives); the full assertion vocabulary is explicitly `@agentform/evaluator`'s Phase 10 deliverable. `spec.deployment.config` is an open record; §6.9 explicitly says to design the interface first and not implement every deployment target early. Modeling these richly now would mean guessing at shapes the spec doesn't actually define yet, and having to make them narrower (a breaking change) once the real requirements land — better to start narrow and widen additively.

## Alternatives considered

- **Hand-maintained JSON Schema alongside Zod**: rejected — two independent representations of the same contract will drift; a generated JSON Schema with an automated parity check is the only way to keep the spec's "must remain synchronized through tests" requirement actually true over time rather than true-until-someone-forgets.
- **`apiVersion` as a semver-range-checked string** (e.g. accept any `1.x`): rejected for now — Agentform hasn't shipped a single version yet, so there is no compatibility range to define. A literal is the honest representation of "there is exactly one schema version today"; range-based compatibility is a real future decision (when `v1beta1` exists) that shouldn't be pre-answered speculatively.
- **Open (non-`.strict()`) objects for forward compatibility**: rejected — silently accepting unknown fields would hide typos and would mean a _future_ field addition to `v1beta1` could already validate (incorrectly) against `v1alpha1`, defeating the purpose of having a version literal at all.

## Consequences

- Every future schema change is either (a) additive and non-breaking within `v1alpha1` (a new optional field), or (b) requires a new `apiVersion` literal and schema module. There is no third option where `v1alpha1`'s meaning quietly shifts.
- `.strict()` everywhere means every new field the product needs must be added to the schema explicitly before any spec file can use it — this is a deliberate speed bump, not an oversight.
- The generated-JSON-Schema-must-match-committed-file test (`json-schema.test.ts`) means `pnpm build` must run before `pnpm test` for the schema package's own regeneration script to be checkable in CI; this is already how Turborepo's `test` task is wired (`turbo.json`: `test` depends on `build`), so no additional sequencing was needed.

## Security impact

`.strict()` schemas are a real, if narrow, security property: they prevent a specification file from smuggling additional, unvalidated fields past schema validation into semantic validation or the IR, where they might otherwise be trusted implicitly by a later stage that only checks for the fields it expects.

## Migration impact

None yet — this is the first schema version. The next schema-affecting decision (introducing `v1beta1` or extending `v1alpha1`) should reference this ADR rather than re-litigate the versioning strategy.
