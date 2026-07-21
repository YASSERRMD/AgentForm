# Agentform intermediate representation (IR) and semantic validation

## Purpose

`@agentform/ir` is the last two stages of the pipeline described in `README.md`:

```text
... → Schema validation → Semantic validation → Agentform IR → ...
```

Given a schema-valid `AgenticApplication` (from `@agentform/schema`'s `validateAgenticApplication`), `buildIR()` runs every semantic check (cross-resource references, workflow graph structure, subworkflow cycles, tool permissions, output references), and — only if none of them fail — compiles the document into `AgentformIR`: framework-neutral, `Map`-keyed resource collections with resolved defaults and a deterministic content hash.

## Minimal example

```ts
import { buildIR } from '@agentform/ir';

const result = buildIR(parsedDocument); // e.g. loadProject()'s output, or any parsed value

if (!result.ir) {
  for (const diagnostic of result.diagnostics) {
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
  }
} else {
  console.log(result.ir.contentHash);
  console.log(result.ir.agents.get('intake'));
}
```

## Semantic checks

| Check                         | Code      | What it validates                                                                                                                                                                                                                                |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unknown model                 | `AGF3001` | An agent's `model` names a declared model.                                                                                                                                                                                                       |
| Unknown tool                  | `AGF3002` | An agent's `tools[]` entries and a workflow tool-node's `tool` (base name, before any `.operation`) name declared tools.                                                                                                                         |
| Unknown agent                 | `AGF3003` | A workflow agent-node's `agent` names a declared agent.                                                                                                                                                                                          |
| Unknown workflow node         | `AGF3004` | A workflow's `entrypoint`, every edge's `from`/`to`, and every node's `onError` name declared nodes _within that workflow_.                                                                                                                      |
| Unreachable node              | `AGF3005` | Every node is reachable from the entrypoint by following edges.                                                                                                                                                                                  |
| Missing terminal path         | `AGF3006` | At least one node reachable from the entrypoint is a sink (no outgoing edges) or an explicit `terminate` node.                                                                                                                                   |
| Unlimited loop                | `AGF3007` | Every graph cycle passes through at least one `loop`-type node (which itself carries `maxIterations`, enforced at the schema level). A cycle through only other node types has no bound.                                                         |
| Duplicate edge                | `AGF3008` | No two edges share the same `from`/`to`/`when`.                                                                                                                                                                                                  |
| Conflicting transition        | `AGF3009` | No node has more than one _unconditional_ outgoing edge — except `parallel` nodes, whose entire purpose is fanning out to every branch unconditionally at once.                                                                                  |
| Invalid approval reference    | `AGF3010` | An edge whose `when` contains `approval.` originates from a `humanApproval` node.                                                                                                                                                                |
| Write tool without permission | `AGF3011` | A tool with `sideEffect: write` or `destructive` declares a non-empty `permissions` list. This is a structural presence check, not the organizational policy enforcement of the same idea — see "Scope" below.                                   |
| Invalid memory reference      | `AGF3012` | An agent's `memory.ref` names a declared memory resource.                                                                                                                                                                                        |
| Invalid subworkflow           | `AGF3013` | A `subworkflow` node's `workflow` names a declared workflow.                                                                                                                                                                                     |
| Circular subworkflow          | `AGF3014` | The graph formed by every workflow-to-workflow subworkflow reference is acyclic.                                                                                                                                                                 |
| Invalid output reference      | `AGF3015` | An output `value` matching the `<collection>.<identifier>...` convention (e.g. `agents.intake.confidence`) names a resource that exists. A value that doesn't match this convention is treated as an opaque literal and isn't validated further. |

Schema-level checks (Phase 2, `AGF2xxx`) always run first; semantic checks only run against an already schema-valid document. `buildIR()` returns no IR — `diagnostics` only — if either stage produced an error.

## Content hashing

`computeContentHash()` (`hash.ts`) hashes a canonical serialization of the IR's resolved resource content: every object's keys sorted recursively, every `Map` converted to a sorted-key object first. This is what makes the hash:

- **Stable** — hashing the same IR twice gives the same hash.
- **Insensitive to source formatting** — two documents that differ only in key order (YAML/JSON key order, `Map`/object insertion order from parsing multiple files) hash identically.
- **Sensitive to actual content changes** — a changed model name, a changed prompt string, a changed field value all change the hash.

The hash covers `application` metadata and every resource collection; it deliberately excludes `irVersion`/`compilerVersion`/`sourceMap` — those describe _how_ the IR was produced, not _what_ it resolved to, and source locations shouldn't affect whether two equivalent documents are considered the same content.

## Scope

- **`write-tool-without-permission` (`AGF3011`) is not the same thing as Phase 6's policy `AF003 write-tools-require-explicit-permission`.** This check only asks "does the tool declare a `permissions` list at all" — a structural completeness gate. The organizational policy engine (`@agentform/policy`, Phase 6) enforces the richer, configurable version of the same idea (who specifically is allowed, under what conditions).
- **Output value references use an inferred convention, not a defined expression language.** The build spec doesn't define a syntax for `outputs.<name>.value`; `validateOutputReferences` recognizes the `<collection>.<identifier>...` pattern used in the product's own examples and validates against it when present, but doesn't invent stricter rules the spec doesn't ask for.
- **The IR does not yet know about adapters.** `adapterRequirements` is always `[]` — `buildIR` runs before any target adapter is selected, so there's no adapter-specific requirement for it to populate yet, regardless of how many adapters exist (six, as of Phase 9).

See `docs/adr/0005-ir-and-semantic-validation.md` for the reasoning behind these boundaries and the `@agentform/core` vs `@agentform/ir` split.

## Security implications

None beyond what's already true of `@agentform/schema`'s output — `buildIR` operates purely on in-memory validated data, no file I/O, no network access, no code execution.

## Troubleshooting

- **A workflow with a real loop reports `AGF3007`**: confirm at least one node _in the cycle itself_ is `type: loop` — a `loop` node elsewhere in the workflow that isn't part of the actual cycle doesn't bound it.
- **A `parallel` node's branches report `AGF3009`**: this shouldn't happen — if it does, check the node's `type` is exactly `"parallel"` (a typo'd type falls through to the generic ambiguous-transition check).
- **`buildIR` returns `ir: undefined` with schema-looking diagnostics (`AGF2xxx`)**: schema validation failed before semantic validation ever ran; fix those first.
- **Content hash changes unexpectedly between two "identical" runs**: check for a real value difference (including inside `evaluations`/`observability`/`deployment`, which are hashed too) — the hash is deliberately sensitive to any actual content change, only insensitive to formatting/ordering.
