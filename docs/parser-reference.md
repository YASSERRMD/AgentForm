# Agentform source parser

## Purpose

`@agentform/parser` turns a project directory into one fully-resolved, in-memory value — the "parsed source document" stage of the pipeline in `README.md`:

```text
YAML or JSON → Parsed source document → Schema validation → ...
```

Everything in this package is about _assembling_ that document safely: parsing YAML/JSON with source locations, following `$ref`/prompt-file/schema-file references, auto-discovering multi-file projects, applying environment overlays, and interpolating `${env.*}`/`${var.*}`/`${local.*}`. It does not know anything about the `AgenticApplication` schema shape — `loadProject`'s output is `unknown`, meant to be handed to `@agentform/schema`'s `validateAgenticApplication` next (Phase 4 wires that handoff into semantic validation and the IR).

## Minimal example

```ts
import { loadProject, nodeFileSystem } from '@agentform/parser';

const result = loadProject({ rootDir: process.cwd(), fs: nodeFileSystem });

if (result.diagnostics.some((d) => d.severity === 'error')) {
  for (const diagnostic of result.diagnostics) {
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(result.value); // fully-resolved AgenticApplication-shaped value
}
```

## Pipeline

`loadProject` runs these stages in order, collecting diagnostics at every step rather than throwing:

1. **Entry discovery** (`discoverEntryFile`) — exactly one of `agentform.yaml`/`agentform.yml`/`agentform.json` must exist in `rootDir`.
2. **Parse + reference resolution** (`loadDocument` + `resolveReferences`) — YAML/JSON parsing with line/column source locations, then a single recursive walk that resolves three marker shapes:
   - `{ $ref: "<path>" }` — splices in another file's parsed content, recursively (a referenced file's own `$ref`s are followed too).
   - `{ file: "<path>" }` — inlines a prompt file's text as `{ text: "<contents>" }`.
   - `{ schemaRef: "<path>" }` — inlines a parsed JSON Schema file as `{ schema: <parsed> }`.

   All three resolve relative to _whichever file currently contains them_ — not always the project root — which is why this is one walk instead of separate passes: a `file:` reference nested inside a `$ref`-loaded file needs to resolve against that file's own directory.

3. **Auto-discovery** (`discoverResourceCollection`) — if `agents/`, `tools/`, or `workflows/` directories exist, every file in each is loaded (through the same reference-resolution walk as step 2) and merged into `spec.agents`/`spec.tools`/`spec.workflows`, keyed by file basename. A file already spliced in via an explicit `$ref` is skipped silently (same resource, intentionally referenced); a basename that collides with a resource declared some other way is a duplicate-resource diagnostic, and the auto-discovered copy is dropped.
4. **Environment overlay** (`mergeOverlay`) — when `options.environment` is set and `environments/<name>.yaml` exists, it's loaded (through the same pipeline) and deep-merged onto the base document.
5. **Interpolation** (`interpolateDocument`) — resolves `${env.*}`/`${var.*}`/`${local.*}` throughout the merged document and strips the resolution-only `variables`/`locals` sections from the output.

## Reference marker grammar

| Marker                    | Resolves to                                | Recurses into target?                                                             |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `{ $ref: "<path>" }`      | The target file's parsed content, in place | Yes — target's own markers are resolved too                                       |
| `{ file: "<path>" }`      | `{ text: "<file contents>" }`              | No — plain text                                                                   |
| `{ schemaRef: "<path>" }` | `{ schema: <parsed JSON/YAML> }`           | No — a JSON Schema file's own `$ref`s are the JSON Schema spec's, not Agentform's |

Every marker path is resolved via `@agentform/core`'s `resolvePathRelativeToFile`, which rejects anything that would escape the project root (absolute paths, `..` traversal past `rootDir`) as an `AGF1002` diagnostic rather than reading the file.

## Safe interpolation grammar

`${namespace.identifier}` where `namespace` is exactly `env`, `var`, or `local`, and `identifier` matches `[A-Za-z_][A-Za-z0-9_]*` — nothing more. There is no arithmetic, no function calls, no property chains, and the implementation never calls `eval` or `Function()` (§7: "Do not use JavaScript eval. Create a safe expression parser."); it's a regular-expression scan and a lookup.

- `${env.NAME}` reads from the injected `env` map (`options.env`, defaults to `process.env`). An unset variable is `AGF1009`, not an empty string.
- `${var.name}` reads from a document-level `variables:` block (each entry optionally has a `default`), or from `options.variableOverrides` (which wins over the default). No default and no override is `AGF1006`.
- `${local.name}` reads from a document-level `locals:` block, whose values may themselves reference `${env.*}`/`${var.*}` (not `${local.*}` — locals can't reference other locals, which avoids needing dependency ordering or cycle detection for a feature that's only meant to compute one named value from var/env).

When a field's value is **exactly** one interpolation (e.g. `maxTokens: ${var.limit}`) the resolved value's original type is preserved — so a numeric variable default can satisfy a numeric schema field. An interpolation embedded in a larger string (`"prefix-${var.x}"`) always coerces to a string, since concatenation has no other sensible result type.

`variables` and `locals` are stripped from `loadProject`'s output — they're inputs to resolution, not part of the `AgenticApplication` schema.

## Environment overlay merge rules

Two rules, applied recursively (§20 "Merge rules must be explicit and deterministic"):

- **Objects merge key-by-key.** Every resource collection (`models`, `tools`, `agents`, `workflows`, `memory`, `outputs`) is itself an object keyed by resource identifier, so this _is_ merge-by-resource-identifier: an overlay entry for an existing resource deep-merges onto it; a new key adds a new resource.
- **Arrays replace, never concatenate.** An overlay's `spec.policies: [...]` entirely replaces the base list. Appending would make the effect of an overlay depend on file-read order in a way that isn't visible from reading the overlay alone.

## Multi-file project layout

```text
agentform.yaml
agents/
  researcher.yaml   # auto-discovered as spec.agents.researcher
  writer.yaml        # auto-discovered as spec.agents.writer
tools/
  search.yaml         # auto-discovered as spec.tools.search
workflows/
  research.yaml         # auto-discovered as spec.workflows.research
environments/
  production.yaml         # merged in when { environment: "production" }
prompts/
  intake.md                 # referenced via instructions: { file: prompts/intake.md }
schemas/
  complaint.json              # referenced via responseFormat: { schemaRef: schemas/complaint.json }
```

## Security implications

- **Path traversal is rejected, not sanitized.** Every file reference (`$ref`, `file`, `schemaRef`, the entry file, overlay files, auto-discovered resources) goes through `resolvePathWithinRoot`/`resolvePathRelativeToFile` from `@agentform/core`, which reject absolute paths and any `..` chain that would resolve outside `rootDir` — as a diagnostic, never a thrown exception that could leak a stack trace with a real filesystem path.
- **Reference cycles and unbounded depth are bounded**, not merely "usually fine": a direct or indirect `$ref` cycle is `AGF1003`; a chain longer than `maxReferenceDepth` (default 32) is `AGF1004`. Both stop resolution rather than recursing until the process runs out of stack.
- **No `eval`, `Function()`, or dynamic `import()`** anywhere in this package — the interpolation grammar above is the entire "expression language," and it's a fixed regular expression plus a map lookup.
- **Filesystem access is fully injected** (`FileSystem` — `readFile`/`exists`/`listFiles`), never called directly from resolution logic, so every path-safety and cycle-detection behavior above is exercised in tests against an in-memory filesystem, not real temp directories.

## Troubleshooting

- **`AGF1002` (unsafe path) on a reference you expect to work**: check the reference is relative to the file that _contains_ it, not the project root — `$ref: ../tools/search.yaml` inside `agents/researcher.yaml` means `tools/search.yaml` at the project root, not `../../tools/search.yaml`.
- **`AGF1005` (duplicate resource) on an auto-discovered file**: another part of the document already declares that resource identifier — either through an explicit `$ref` to a _different_ file, or an inline declaration. Auto-discovery only steps aside silently for the _same_ file already consumed via `$ref`.
- **A `${var.x}` you expected to resolve reports `AGF1006`**: it has no `default` in the document's `variables:` block and no entry in `variableOverrides`. Declare a default or pass an override.
- **A numeric field ends up as a string after interpolation**: the field's value has surrounding text beyond the single `${...}` — e.g. `maxTokens: "${var.limit} tokens"` always coerces to a string; only a field whose entire value is one interpolation preserves the resolved value's original type.
