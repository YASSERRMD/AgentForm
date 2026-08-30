# ADR-0023: Resolving the AF014 and AF015 placeholders

## Status

Accepted

## Context

`AF014` (`state-must-not-contain-secrets`) and `AF015` (`generated-code-must-be-reproducible`) shipped in Phase 6 as registered, mandatory policies whose `check` was `() => []`. Both files, and `docs/policy-reference.md`, justified that with a forward reference: AF014 "always passes until Phase 7 adds a state engine to check", AF015 "always passes until Phase 8 adds a compiler to check".

Phase 7 (`@agentform/state`, `state-local`, `state-postgres`) and Phase 8 (`@agentform/compiler` and its adapters) both shipped, and the repository is well past Phase 18 plus a hardening pass. Nobody went back. The stated blocker no longer exists, so the justification in the code and the docs is now false: a reader inspecting policy results sees two mandatory `pass` rows and a comment blaming a phase that has long since landed.

Leaving that stale is the one option not on the table. The two policies do not, however, have the same answer once you look at what each would actually check.

## Decision

### AF014 is implemented for real

`PolicyContext` gains an optional `state?: PolicyStateSnapshot` — a structurally-typed view (`application`, `resources`, `applyHistory`) so `@agentform/policy` does not take a dependency on `@agentform/state`; the state package's own `ApplicationState`, `ResourceState[]`, and `ApplyHistoryEntry[]` satisfy it as-is. AF014 walks every string in that snapshot through the same `detectSecret`/`SECRET_PATTERNS`/`redactSecretValue` machinery AF001 applies to the source document, so a finding can never echo the value it flagged.

The four commands that already open a state backend — `apply`, `status`, `drift`, `rollback` — populate it via a new `readPolicyStateSnapshot(backend)` helper. `validate`, `plan`, and `test` run before any state is read and leave it `undefined`; AF014 then returns a clean pass, because there is genuinely nothing deployed to inspect. That is a different claim from "this policy is unimplemented", and the tests assert both branches.

The check is narrower than its name suggests, deliberately. `ResourceState` stores content and identity hashes rather than resource values — §10's "never store raw secret values" is satisfied at the type level, and no runtime scan can improve on a shape that cannot hold a secret. What remains genuinely free-form is `ApplicationState.deploymentIdentifiers` (arbitrary adapter-supplied strings) and `ApplyHistoryEntry.summary`. AF014 is defense in depth over those: it catches a backend or adapter writing a token where an identifier belongs.

### AF015 stays a no-op, with an honest reason

The policy engine evaluates the source `AgenticApplication`, in `validate`, `plan`, `apply`, `test`, `status`, and `drift`. Generated code exists in none of those. It exists only after `agentform compile` (or `apply`'s generation step), and asserting reproducibility means generating the same IR twice and diffing the output — a whole-project operation, at a stage where no other policy runs, against an artifact `PolicyContext` has no representation for.

Wiring that in is not a policy implementation; it is a second, artifact-scoped evaluation stage in the compiler pipeline, with its own context type and its own answer to "what does a failing reproducibility check do to an in-flight `apply`". That is a real architectural change and does not belong in a bug-fix pass.

Meanwhile the property is not unguarded. Generation is a pure function of the IR, which carries a content hash, and every adapter package has its own "two `generate()` calls produce identical output" test. That is a build-time guarantee over the generators rather than a per-project runtime check — a weaker claim than AF015's name makes, which is exactly why the code comment, the policy `description`, and `docs/policy-reference.md` now all say so instead of implying a check ran.

AF015 stays registered and mandatory. That was always the sound half of the original decision: an override config committed today cannot disable it, so implementing it later needs no migration of anyone's `agentform.policy.yaml`.

## Consequences

- AF014 can now fail, at `error` severity, on a mandatory policy — `apply` and `rollback` abort with `POLICY_FAILURE`, and `status`/`drift` report `FAILED`. This is correct: a credential in persisted state should be treated as compromised. It cannot fire on a project that has never been applied, because there is no state to scan.
- `PolicyContext` grew an optional field. Existing callers that pass only `application` keep compiling and keep behaving identically.
- The asymmetry is the point: two policies that looked identical (`check: () => []`, same excuse) turned out to have different answers once the excuse was removed. Reading AF014's and AF015's results now means different things, and the reference documents which is which.
- AF015's honest label is a standing invitation to implement it properly. If a compile-time policy stage is ever built, this ADR is the record of what it would need: an artifact-scoped `PolicyContext`, and a decision about how a failure interacts with `apply`.
