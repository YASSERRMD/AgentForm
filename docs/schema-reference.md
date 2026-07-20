# Agentform specification schema (v1alpha1)

## Purpose

`@agentform/schema` defines the `v1alpha1` `AgenticApplication` document shape as [Zod](https://zod.dev) schemas, and validates a parsed source document (already loaded from YAML/JSON — see `@agentform/parser`, Phase 3) against it. It is the **schema validation** stage of the pipeline described in `README.md`:

```text
Parsed source document → Schema validation → Semantic validation → Agentform IR → ...
```

Schema validation checks _shape_: required fields, types, enums, string formats, no-duplicate-entries in reference lists. It does **not** check _meaning_ — whether `agents.intake.model` actually names a declared model, or whether a workflow graph has a terminal path, are semantic checks that happen later against the IR (Phase 4), because they require resolving references across the whole document rather than validating one field in isolation.

## Minimal example

```yaml
apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication
metadata:
  name: basic-assistant
  version: 1.0.0
spec:
  runtime:
    target: openai
    environment: development
  models:
    primary:
      provider: openai
      model: gpt-5
  agents:
    assistant:
      model: primary
      role: assistant
      instructions:
        text: You are a helpful assistant.
  workflows:
    main:
      entrypoint: assistant
      nodes:
        assistant:
          type: agent
          agent: assistant
```

See [`specifications/v1alpha1/examples/basic-assistant.yaml`](../specifications/v1alpha1/examples/basic-assistant.yaml) for the full runnable fixture.

## Production example

[`specifications/v1alpha1/examples/municipal-complaint-assistant.yaml`](../specifications/v1alpha1/examples/municipal-complaint-assistant.yaml) — the canonical example from the Agentform product spec — exercises every top-level resource: an MCP tool, an HTTP tool with a nested operation, an agent with tool references and cost/step limits, a three-node workflow with conditional edges and a human-approval gate, policy references, evaluation datasets/thresholds, and observability settings.

## Resources

| Resource             | Zod export                              | Notes                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root document        | `agenticApplicationSchema`              | `apiVersion` and `kind` are fixed literals (`agentform.dev/v1alpha1`, `AgenticApplication`).                                                                                                                                                                                  |
| `metadata`           | `metadataSchema`                        | `name` is an _identifier_ (see below); `version` must be semver.                                                                                                                                                                                                              |
| `spec.runtime`       | `runtimeSchema`                         | `target` is one of the six supported frameworks (`frameworkTargetSchema`).                                                                                                                                                                                                    |
| `spec.models`        | `modelSchema` (map)                     | Fields from the build spec §6.2. Only `provider`/`model` are required — adapters report which of the rest they don't support (Phase 8+), not the schema.                                                                                                                      |
| `spec.tools`         | `toolSchema` (map, discriminated union) | Nine tool types: `mcp`, `http`, `openapi`, `function`, `database`, `queue`, `agent`, `humanApproval`, `customPlugin`. Each carries the type-specific fields plus a shared set (timeout, retries, permissions, side-effect classification, ...).                               |
| `spec.agents`        | `agentSchema` (map)                     | `model`, `role`, and `instructions` are required; `instructions` is either `{ file: <path> }` or `{ text: <inline> }`.                                                                                                                                                        |
| `spec.workflows`     | `workflowSchema` (map)                  | `entrypoint` and at least one entry in `nodes` are required. `nodes` is a discriminated union over the thirteen node types from §6.5. `edges` connect nodes with an optional `when` guard expression (validated as non-empty text only — safe expression parsing is Phase 3). |
| `spec.memory`        | `memorySchema` (map)                    | Optional; seven memory types (`conversation`, `session`, `longTerm`, `vector`, `keyValue`, `relational`, `external`).                                                                                                                                                         |
| `spec.policies`      | array of identifiers                    | References to policy IDs (e.g. built-ins like `AF001`–`AF015` once `@agentform/policy` exists from Phase 6) — no duplicates allowed.                                                                                                                                          |
| `spec.evaluations`   | `evaluationSchema`                      | Minimal today (`datasets`, `thresholds`); the full assertion vocabulary (tool-call/workflow-path/cost/latency assertions, LLM-as-judge) is `@agentform/evaluator`, Phase 10.                                                                                                  |
| `spec.observability` | `observabilitySchema`                   | Tracing provider + prompt/tool-call recording toggles.                                                                                                                                                                                                                        |
| `spec.deployment`    | `deploymentSchema`                      | Deliberately loose (`config` is an open record) — per §6.9, deployment targets are designed as an interface first and implemented later.                                                                                                                                      |
| `spec.outputs`       | `outputSchema` (map)                    | Optional named output values.                                                                                                                                                                                                                                                 |

### Identifiers

Resource map keys (model/tool/agent/workflow/node names, policy IDs) must match `identifierSchema`: start with a letter, then letters/digits/`_`/`-`. This keeps them safe to reuse as file names, env var fragments, and generated-code symbols in later phases.

## Validation behavior

```ts
import { validateAgenticApplication } from '@agentform/schema';

const result = validateAgenticApplication(parsedDocument);
if (!result.success) {
  for (const diagnostic of result.diagnostics) {
    console.error(`[${diagnostic.code}] ${diagnostic.message} (at ${diagnostic.path?.join('.')})`);
  }
}
```

- `validateAgenticApplication` never throws on an invalid document — it returns **every** diagnostic, not just the first, via `safeParse`.
- Every diagnostic has a stable code in the `AGF2xxx` range (`SCHEMA_DIAGNOSTIC_CODES` — see `src/codes.ts`), a `severity`, a `message`, and a `path` (field path from the document root). Duplicate codes across the table throw at module load time (`defineDiagnosticCodes`), so a copy-paste mistake fails immediately in CI rather than shipping a collision.
- The schema is `.strict()` at every object level — an unrecognized key is a validation error (`AGF2006`), not a silently-dropped field.

## Generated JSON Schema

`pnpm --filter @agentform/schema generate:json-schema` (after `pnpm build`) regenerates [`specifications/v1alpha1/agentic-application.schema.json`](../specifications/v1alpha1/agentic-application.schema.json) from the Zod schemas via `z.toJSONSchema()`. CI regenerates it and fails the build on any diff, so the committed JSON Schema can never drift from the Zod source of truth — this is what "JSON Schema/Zod parity" means in practice here, backed by `packages/schema/src/json-schema.test.ts`.

## Security implications

- No file I/O, network access, or code execution happens in this package — it validates an already-in-memory JS value. Untrusted YAML/JSON becomes untrusted-but-safe-to-parse-as-data starting in `@agentform/parser` (Phase 3); this package only ever sees the result.
- `.strict()` schemas reject unexpected keys instead of passing them through, which is what keeps a malicious or malformed document from smuggling extra fields past validation into later pipeline stages.

## Target-framework limitations

None yet — this package is framework-neutral by construction (§3.2) and has no knowledge of OpenAI/LangGraph/etc. Per-framework compatibility reporting (which `Model`/`Tool`/`Workflow` fields a given adapter can't honor) is adapter-level behavior starting Phase 8.

## Troubleshooting

- **"Unrecognized key" (`AGF2006`) on a field you expect to exist**: check spelling and nesting against the tables above — every object in this schema is closed (`.strict()`), so typos surface immediately instead of being silently ignored.
- **A discriminated-union field (tool or workflow node) reports `AGF2008` with no further detail on which variant you meant**: Zod reports discriminated-union mismatches once per candidate branch when the `type` value itself doesn't match any known literal; double-check the `type` string against the tables above (e.g. `humanApproval`, not `human-approval`).
- **Regenerating the JSON Schema produces a diff you didn't expect**: you changed a Zod schema without also running `pnpm --filter @agentform/schema generate:json-schema`; re-run it and commit the result.
