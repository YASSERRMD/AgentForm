# ADR-0005: IR structure and semantic validation architecture

## Status

Accepted

## Context

Phase 4 (`temp/instruction.md` §8–9, Phase 4 objectives) requires a canonical, framework-neutral IR with `Map`-keyed collections, resolved defaults, stable content hashing, and 15 named semantic checks — but says "semantic validation modules in `@agentform/core`" without saying what that means when `@agentform/core` is a low-level, foundational package that (before this phase) depended on nothing else, and that every other package depends on. Making `@agentform/core` depend on `@agentform/schema` (needed to type-check `AgenticApplication`-shaped semantic checks) would invert that — a foundational package reaching up into a domain-specific one.

## Decision

- **`@agentform/core` gets a generic directed-graph utility (`graph.ts`), not the semantic checks themselves.** `reachableNodes`, `sinkNodes`, and `findCycle` operate on a structural `DirectedGraph<NodeId>` — no knowledge of workflows, agents, or the Agentform schema at all. This is genuinely cross-cutting (the same three operations power workflow-graph validation _and_ subworkflow-cycle detection in this phase, and are the obvious tool for policy-dependency or module-dependency graphs in later phases) without core depending on schema.
- **`@agentform/ir` contains all 15 semantic checks**, built on top of `@agentform/core`'s graph utility. This keeps the dependency direction sane (`ir` depends on `core` and `schema`; `core` depends on neither) while still satisfying the spirit of "semantic validation modules in `@agentform/core`" — the reusable _infrastructure_ those checks are built from lives there.
- **IR resource types are the validated `@agentform/schema` types directly** (`IRModel = Model`, `IRTool = Tool`, etc.), not hand-redefined field-for-field. §6's field lists are already what the IR needs at the leaf level; redefining them would just be two sources of truth for the same shape. What Phase 4 actually adds is graph-level structure (`Map`-keyed collections instead of the schema's plain objects), resolved defaults (applied at `buildIR()` time — e.g. an agent's `tools` is always a real array in the IR even when the source omitted it, never `undefined`), and the `AgentformIR` envelope itself (source map, content hash, version metadata).
- **Content hashing canonicalizes before hashing, rather than hashing raw serialized input.** `hash.ts`'s `canonicalize()` recursively sorts every object's keys and converts every `Map` to a sorted-key object before `JSON.stringify` + SHA-256. This is what makes "equivalent formatting produces the same IR" and "resource order does not affect hash" true by construction rather than by convention.
- **`write-tool-without-permission` is deliberately narrower than it sounds.** It checks structural presence (`permissions.length > 0`) on a write/destructive tool, not organizational authorization rules — that richer, configurable enforcement is `@agentform/policy`'s `AF003`, Phase 6. Building a fake version of policy enforcement here, ahead of the actual policy engine, would mean re-deciding this exact behavior twice.
- **`invalid-output-reference` validates an inferred convention, not a defined language.** `spec.outputs.*.value` has no expression syntax defined anywhere in the build spec (unlike `when`/`condition`/`transform`, which are at least acknowledged as future expression-language surface in `@agentform/schema`'s ADR-0003). Rather than invent one, this check recognizes the one pattern the product's own examples imply (`<collection>.<identifier>...`) and validates only that; anything else is treated as an opaque literal.
- **`parallel` nodes are exempted from the conflicting-transition check.** A first pass flagged any node with 2+ unconditional outgoing edges as `AGF3009` — which is correct for `agent`/`router`/etc. nodes (an ambiguous default path) but wrong for `parallel` nodes, whose entire purpose is fanning out to every branch unconditionally at once. Caught by a real test (`graph.test.ts`'s "passes a valid parallel/join graph") before this reached a PR, not after.

## Alternatives considered

- **Redefine every IR resource type from scratch** (rather than aliasing `@agentform/schema`'s types): rejected — pure duplication of §6's field lists with no behavioral benefit, and a second place every future schema field addition would need to be mirrored.
- **Put the semantic checks directly in `@agentform/core`** (the spec's literal wording): rejected — would make a package every other package depends on itself depend on `@agentform/schema`, inverting the dependency graph for no benefit the graph-utility split doesn't already capture.
- **Hash the raw parsed value instead of canonicalizing first**: rejected — would make the hash sensitive to source key order and `Map`/object insertion order, directly failing the "equivalent formatting produces same IR" and "resource order does not affect hash" requirements.
- **Implement full `AF003`-equivalent policy enforcement now**: rejected — no policy engine or organizational policy-pack concept exists yet (Phase 6); a structural presence check is the honest subset of that idea available at this phase.

## Consequences

- Any future graph-shaped validation (module dependency cycles in the Phase 12 registry, policy dependency ordering) should reuse `@agentform/core`'s `graph.ts` rather than reimplementing reachability/cycle-detection locally.
- `buildIR()` short-circuits on the first stage (schema, then semantic) that produces an error-severity diagnostic — it never returns a partially-normalized IR. A caller that wants "best-effort" partial IR construction for tooling like an IDE would need a different entry point; none exists yet because nothing in Phase 4's scope needs it.
- The output-reference convention (`<collection>.<identifier>...`) is informal — if a later phase defines a real output-value expression language, `validateOutputReferences` will need revisiting, and this ADR is where that decision should be recorded as superseded.

## Security impact

None beyond what `@agentform/schema` and `@agentform/parser` already established — `@agentform/ir` operates entirely on in-memory, already-validated data.

## Migration impact

None — this is the initial IR implementation.
