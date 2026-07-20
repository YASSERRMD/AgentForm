# Agentform threat model

## Purpose

Agentform is a control plane for agentic AI systems: a specification language, a compiler, and a policy engine that sit between a human author and whatever framework/runtime actually executes an agent. That position gives it two distinct attack surfaces — the _documents_ it parses and validates (which may be authored by someone untrusted, or composed from imported projects) and the _systems it will eventually drive_ (frameworks, tools, deployment targets, state). This document tracks both, following §19 of the build specification.

Status labels used below:

- **Mitigated** — a concrete, tested control exists today.
- **Partially mitigated** — a real control exists but doesn't cover the full threat (usually because the runtime half of Agentform doesn't exist yet).
- **Planned** — no control exists yet because the subsystem it would protect doesn't exist yet; a placeholder is registered where one makes sense so it can't be silently disabled later.

As of Phase 8, Agentform validates, compiles to an IR, evaluates policy, can plan (compare desired state against a local SQLite-backed record of deployed state), and can compile a specification into a real OpenAI Agents SDK or LangGraph project against specifications. It does not yet execute agents, actually apply state, or generate code for the remaining four target frameworks — several threats below are structurally about _runtime_ behavior Agentform doesn't have yet, or about frameworks Phase 9 hasn't added adapters for. Those are marked Planned rather than overclaimed as mitigated.

## Threats and mitigations

### Malicious Agentform files

A hostile YAML/JSON document crafted to exploit the parser, the schema validator, or a downstream reader. **Mitigated**: safe YAML parsing (see below), full Zod schema validation rejects anything off-shape, a maximum source file size (`AGF1010`), a maximum `$ref` chain depth (`AGF1004`), reference cycle detection (`AGF1003`), and workflow node/edge/expression-length caps (`AGF3016`–`AGF3018`) all apply before or during parsing — see [`packages/parser`](../../packages/parser) and [`packages/ir/src/semantic/limits.ts`](../../packages/ir/src/semantic/limits.ts).

### Prompt injection

Text inside an agent's instructions, a tool's description, or interpolated content that's designed to manipulate the model at run time. **Planned** (structural mitigations only): Agentform validates and compiles specifications; it does not run a model against a prompt itself, so it cannot detect injected intent at parse time — that's inherently a runtime/model-level concern, not a static-analysis one. What today's policy engine _does_ do is bound the blast radius of a successful injection: [`AF004`](../../packages/policy/src/policies/af004-critical-actions-require-human-approval.ts) requires human approval before a destructive tool runs regardless of what convinced the agent to call it, and [`AF003`](../../packages/policy/src/policies/af003-write-tools-require-explicit-permission.ts)/[`AF002`](../../packages/policy/src/policies/af002-no-unrestricted-shell-tools.ts) keep an agent's tool surface narrow. Phase 8's OpenAI adapter now generates a real, named stub per declared guardrail (`InputGuardrail`-typed, wired into the agent's `inputGuardrails`) — the _scaffolding_ for a runtime defense exists and is structurally correct, but the stub body always reports `tripwireTriggered: false` until a human fills in real detection logic, so this remains Planned for actual mitigation, not Mitigated by the stub's existence alone.

### Tool injection

A malicious or spoofed tool definition entering the resolved document, e.g. via a compromised imported project. **Mitigated** for the injection vector, **partially mitigated** for impact: every reference (`$ref`/`file`/`schemaRef`) resolves to a local path inside the project root only — there is no URL-fetching reference type, so a tool definition can't be pulled from an untrusted network source at parse time. An injected tool is still subject to the full policy pack: `AF002`/`AF003`/`AF012` limit what it can declare itself capable of.

### Compromised plugins

`customPlugin` exists as a tool _type_ in the schema (§6.4), but there is no plugin loading or execution mechanism yet — `@agentform/plugin-sdk` has no runtime implementation as of Phase 6. **Planned**: §19's "plugin trust policy" is meaningful once plugins can actually be loaded and run; until then there is nothing to compromise.

### Secret leakage

A real credential appearing in a document, a diagnostic message, a log line, a test snapshot, or — new in Phase 8 — generated framework code. **Mitigated**: [`AF001`](../../packages/policy/src/policies/af001-no-inline-secrets.ts) walks the entire document looking for known credential shapes; [`redactSecretValue`](../../packages/policy/src/redact.ts) ensures any message that names a detected secret never echoes the raw value; [`AF010`](../../packages/policy/src/policies/af010-prompt-recording-disabled-for-restricted-data.ts) blocks `recordPrompts: true` alongside restricted-classification data, and `recordPrompts` itself defaults to unset/off (§18). `@agentform/compiler`'s `scanForSecretLeaks` (reusing the same `detectSecret`/`SECRET_PATTERNS` `AF001` uses) runs over every file either adapter generates and blocks `compile()` from returning a project containing a secret-shaped value, regardless of whether the value reached the IR through `${env.*}` interpolation (already fully resolved before the compiler ever sees it) or some other path — see `docs/compiler-reference.md`.

### State tampering

Unauthorized modification of Agentform's persisted current-state record. **Partially mitigated**: [`@agentform/state-local`](../../packages/state-local) stores every mutation in a real transactional database (SQLite, atomic per-migration and — once `apply` exists in Phase 11 — per-apply transactions), and file-based locking (`.agentform/lock`) prevents two `agentform` processes from writing concurrently. What's not yet covered: `state.db` itself has no integrity check (a hash over its contents, checked on open) and no encryption at rest (§6.6 lists encryption hooks as future work) — protection today is "hard to corrupt via normal concurrent use," not "detects a file edited directly on disk." [`AF014`](../../packages/policy/src/policies/af014-state-must-not-contain-secrets.ts) remains a mandatory placeholder for the same reason as before: nothing raw is stored in state to leak in the first place (see `docs/state-reference.md`), so there's currently nothing for a real `AF014` check to find.

### Plan tampering

Unauthorized modification of a generated plan file between `plan` and `apply`. **Mitigated**: [`@agentform/planner`](../../packages/planner)'s `.afplan` files are tamper-evident — `createPlanFile`/`verifyPlanFile` compute and check a content hash (the same canonicalization [`computeContentHash`](../../packages/ir/src/hash.ts) uses) over the plan's full contents; any edit to the file, including an attempt to also edit the recorded hash to match, is caught on verify (`packages/planner/src/plan-file.test.ts` proves both cases). What's not yet wired up: no command actually calls `verifyPlanFile` before acting on a saved plan yet, since `agentform apply plan.afplan` doesn't exist until Phase 11 — the detection mechanism exists and is tested standalone, but nothing consumes it end-to-end yet.

### Generated-code tampering

Unauthorized modification of framework code Agentform generates. **Partially mitigated**: generation is deterministic — the same IR always produces byte-identical files (proven for both adapters: `adapter.test.ts`'s "two `generate()` calls produce byte-identical files" test), and every generated project carries a manifest recording the exact `sourceHash`/`irHash` that produced it (§22, `generatedAt` always `null`). Together these make tampering _detectable_ by recompiling from the same source and diffing against the manifest's recorded hashes — but nothing automated does this today; there is no `agentform compile --verify`-style command, and the manifest hashes the _inputs_ to generation, not the generated files themselves. [`AF015`](../../packages/policy/src/policies/af015-generated-code-must-be-reproducible.ts) (registered since Phase 6) is exactly the policy this phase gives real teeth to — a non-deterministic adapter would now actually fail its own test suite, not just violate an aspirational policy.

### Unsupported specification fields silently dropped

A compiler that generates a project missing part of what the specification actually declared, without saying so — the generated system would then diverge from the declared desired state in a way nothing surfaces. **Mitigated**: every adapter's `validateCompatibility` reports every workflow node type and tool type against what it can actually generate; any `unsupported` entry sets `hasBlockingIncompatibility`, and `compile()` refuses to call `generate()` at all when that's set — returning diagnostics only, never a partial project (§12 "do not silently ignore unsupported specification fields," enforced structurally, not by adapter discipline alone). `agentform compile` surfaces this as exit code 13 with a diagnostic naming the specific unsupported feature. See `docs/compiler-reference.md`.

### Dependency confusion

A malicious package with a name similar to a real Agentform package or plugin getting installed instead. **Mitigated** at the tooling level, not an Agentform-product level: every package is scoped (`@agentform/*`), the workspace lockfile is committed, and CI installs with `pnpm install --frozen-lockfile` ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) rather than resolving fresh ranges.

### Path traversal

A reference that tries to resolve outside the project root. **Mitigated**: every file reference — `$ref`, `file`, `schemaRef`, the entry file, environment overlays, auto-discovered resources — goes through [`resolvePathWithinRoot`/`resolvePathRelativeToFile`](../../packages/core/src/safe-path.ts), which reject absolute paths and any `..` chain that escapes `rootDir` as a diagnostic (`AGF1002`), never a thrown exception. Proven against a real on-disk fixture in [`specifications/v1alpha1/security/malicious-path`](../../specifications/v1alpha1/security/malicious-path).

### Unsafe file references

The general case of the above: any reference mechanism that could read something it shouldn't. **Mitigated** by the same sandbox — `file`/`schemaRef`/`$ref` are the _only_ reference mechanisms, all local-path-only, all sandboxed identically.

### Arbitrary code execution

Something in a document causing Agentform's own process to execute attacker-controlled code. **Mitigated** for Agentform itself: no `eval`, `Function()`, or dynamic `import()` anywhere in this codebase (see ADR-0004); YAML parsing never executes custom tags. **Out of scope by design**: whether a _generated_ `function`/`customPlugin` tool itself wraps shell execution is an application-author decision Agentform can flag ([`AF002`](../../packages/policy/src/policies/af002-no-unrestricted-shell-tools.ts)) but not prevent outright — and there is no Agentform runtime executing tools yet regardless.

### SSRF through HTTP tools

An `http`/`openapi` tool's destination pointing at an internal service or a cloud metadata endpoint (e.g. `169.254.169.254`). **Partially mitigated**: [`AF012`](../../packages/policy/src/policies/af012-network-destinations-must-be-allowlisted.ts) requires `networkDestination` to be explicitly declared for network-capable tools, closing the "unconstrained because undeclared" gap. There is no request-time enforcement yet (blocking specific destinations at the moment a call is made) because there is no HTTP-tool runtime yet — that lands with the adapter/runtime work.

### Excessive network permissions

A tool or agent granted broader network reach than it needs. **Partially mitigated** by the same `AF012`, plus `AF003`'s general requirement that any write/destructive tool declare explicit permissions.

### Unrestricted shell execution

A tool that can run arbitrary shell commands with no declared constraints. **Mitigated** structurally: [`AF002`](../../packages/policy/src/policies/af002-no-unrestricted-shell-tools.ts) flags a `function`/`customPlugin`/`mcp` tool whose handler/plugin/operation name indicates shell execution and has no declared `permissions`. As with arbitrary code execution above, this is a pre-execution structural check — there is no tool-execution runtime yet for it to gate directly.

### Poisoned imported projects

A project composed via `$ref`/auto-discovery from an untrusted source smuggling in a malicious resource. **Partially mitigated**: an imported file is bound by exactly the same project-root sandbox and the same policy pack (`AF001`–`AF015`) as hand-authored content — it can't escape the sandbox, and if it inlines a secret, an unrestricted shell tool, or an unpermissioned write tool, the same policies catch it at validation time. What's _not_ yet supported is a separate trust tier for imported vs. authored content (e.g. "apply stricter policy severity to anything pulled in from outside this repository") — everything is validated equally today.

### Unsafe YAML behavior

YAML's historical footguns: custom tag execution, unbounded anchor/alias expansion, implicit type coercion surprises. **Mitigated**: parsing goes through the `yaml` npm package's `parseDocument`, which does not execute custom tags or construct arbitrary objects the way some other ecosystems' "unsafe load" functions do; duplicate keys are rejected (`uniqueKeys: true`) rather than silently overwriting.

### Denial-of-service through recursive references

A `$ref` chain designed to recurse until the process exhausts memory or its call stack. **Mitigated**: reference cycle detection (`AGF1003`) and a maximum reference depth (`AGF1004`, default 32) both stop resolution rather than recursing indefinitely. Proven against a real on-disk fixture in [`specifications/v1alpha1/security/recursive-reference-exhaustion`](../../specifications/v1alpha1/security/recursive-reference-exhaustion).

### Workflow infinite loops

A workflow graph cycle with no bound on iteration count. **Mitigated**: `@agentform/ir`'s graph cycle detection rejects any cycle not passing through a `loop` node (`AGF3007`), and a `loop` node's `maxIterations` is schema-required to be a positive integer — [`AF005`](../../packages/policy/src/policies/af005-workflow-loops-require-limits.ts) re-verifies the same invariant at the policy layer as defense in depth against a `PolicyContext` built from data that bypassed schema validation.

### Cost exhaustion

A run that spends far more (in token or dollar cost) than intended. **Partially mitigated**: the schema supports per-agent `limits.maxCostUsd`/`limits.maxSteps` and per-model `rateLimits`/`costMetadata`, and the structural size caps (`AGF3016`–`AGF3018`) bound the worst-case shape of a single workflow. There is no run-time cost _enforcement_ yet — nothing executes an agent yet, so nothing can overspend yet — that's the evaluation engine's cost assertions (§17, Phase 10) and the apply/runtime work (Phase 11).

### Tool-call amplification

A structure that causes a small input to trigger an unbounded or exponential number of tool calls (unbounded retries, unbounded fan-out). **Partially mitigated**: `retry.maxAttempts` and `limits.maxSteps` are schema-supported per agent; workflow node/edge caps bound structural fan-out; loop nodes require `maxIterations`. As with cost exhaustion, _counting and stopping_ excessive calls at run time needs a runtime that doesn't exist yet.

## Defense-in-depth summary

| Protection                                         | Where                                                                   | Status                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Reference cycle detection                          | `@agentform/parser` (`AGF1003`)                                         | Mitigated                                                                                |
| Maximum reference depth                            | `@agentform/parser` (`AGF1004`)                                         | Mitigated                                                                                |
| File access confined to project root               | `@agentform/core` safe-path, used throughout the parser                 | Mitigated                                                                                |
| Safe path normalization                            | `@agentform/core` (`resolvePathWithinRoot`/`resolvePathRelativeToFile`) | Mitigated                                                                                |
| Maximum source file size                           | `@agentform/parser` (`AGF1010`)                                         | Mitigated                                                                                |
| Maximum workflow nodes                             | `@agentform/ir` (`AGF3016`)                                             | Mitigated                                                                                |
| Maximum graph edges                                | `@agentform/ir` (`AGF3017`)                                             | Mitigated                                                                                |
| Maximum expression complexity (length proxy)       | `@agentform/ir` (`AGF3018`)                                             | Mitigated                                                                                |
| Network allowlisting                               | `@agentform/policy` `AF012`                                             | Partially mitigated (declaration only, no request-time enforcement)                      |
| Plugin trust policy                                | —                                                                       | Planned (Phase 8+, once plugins load)                                                    |
| Content hashing                                    | `@agentform/ir` (`computeContentHash`)                                  | Mitigated                                                                                |
| State atomicity and locking                        | `@agentform/state-local` (SQLite transactions, file lock)               | Mitigated                                                                                |
| State integrity checks (tamper detection)          | —                                                                       | Planned                                                                                  |
| Plan integrity checks                              | `@agentform/planner` (`createPlanFile`/`verifyPlanFile`)                | Mitigated (detection only — no command calls it yet; Phase 11)                           |
| Redacted logs/diagnostics                          | `@agentform/policy` (`redactSecretValue`, `AF001`, `AF010`)             | Mitigated                                                                                |
| Blocking incompatibility (no silent feature drops) | `@agentform/compiler` (`compile()`, `AGF5001`)                          | Mitigated                                                                                |
| Generated-code secret scan                         | `@agentform/compiler` (`scanForSecretLeaks`, `AGF5003`)                 | Mitigated                                                                                |
| Generated-code determinism + manifest hashing      | `@agentform/compiler`/adapters (`buildManifest`, `generatedAt: null`)   | Partially mitigated (detectable via recompile-and-diff; no automated verify command yet) |
| Safe YAML parsing                                  | `@agentform/parser` (`yaml` package)                                    | Mitigated                                                                                |

## Verifying these protections

- `packages/parser/src/refs.test.ts` and `packages/parser/src/discover.test.ts` — reference cycle, max depth, max file size, unsafe path, in-memory filesystem.
- `packages/parser/src/security-fixtures.test.ts` — the same protections proven against real on-disk fixture projects rather than the in-memory test harness.
- `packages/ir/src/semantic/limits.test.ts` — workflow node/edge/expression-length caps.
- `packages/policy/src/policies/*.test.ts` — every built-in policy, including the redaction and mandatory-override tests in `packages/policy/src/evaluate.test.ts` and `packages/policy/src/redact.test.ts`.
- `packages/state-local/src/lock.test.ts` and `sqlite-state-backend.test.ts` — lock contention/staleness, atomic transactions, crash recovery, all against real temp-directory SQLite files.
- `packages/planner/src/plan-file.test.ts` — plan file tamper detection, including an attempt to also edit the recorded hash.
- `packages/compiler/src/secret-scan.test.ts` and `packages/compiler/src/compile.test.ts` — the generated-code secret scan and blocking-incompatibility gate, including a fixture that would otherwise leak a secret-shaped value.
- `packages/adapter-openai/src/adapter.test.ts` and `packages/adapter-langgraph/src/adapter.test.ts` — deterministic generation (byte-identical repeat `generate()` calls) and isolation (a prompt-only change alters only that agent's file), the two properties `AF015`/manifest hashing depend on.

## Updating this document

Add a section (or update a status label) whenever a phase changes what's actually enforced — a status of "Planned" that quietly becomes true without this document being updated is itself a documentation-drift risk. Phase 8 moved "Generated-code tampering" from Planned to Partially mitigated and added the blocking-incompatibility and generated-code-secret-scan rows above; it deliberately left "Generated-code tampering" at Partially (not Mitigated) since there's still no automated verify command, and left "Prompt injection" at Planned since Phase 8's guardrail stubs are structural scaffolding, not real runtime filtering. Phase 9 (the remaining four adapters) is expected to extend the same rows to cover Microsoft/Google ADK/AutoGen/CrewAI rather than open new ones; Phase 11 (apply/drift/rollback) is what's expected to move plan-file verification and state's real-world write path from Planned/Partially mitigated to Mitigated, since `apply` is the first command that will read a saved plan back.
