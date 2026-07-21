# Agentform adapter guide

## Purpose

`docs/compiler-reference.md` documents how Agentform's six existing framework adapters behave — what each one generates, and how they compare. This guide is for building a seventh: the `FrameworkAdapter` contract every adapter implements, what each method is required to return, and how a new implementation gets wired into `agentform compile`/`agentform apply`.

`@agentform/compiler` (`docs/compiler-reference.md`) never contains framework-specific logic itself — every detail of what a target framework's code looks like lives in one `FrameworkAdapter` implementation per framework, published as its own package (`@agentform/adapter-openai`, `@agentform/adapter-langgraph`, and so on, one `packages/adapter-<name>/` directory each). Adding support for a new target framework means writing a new package that implements this interface; nothing about `@agentform/compiler`, `agentform compile`, or `agentform apply` needs to change to accommodate it beyond one registry entry.

## The `FrameworkAdapter` interface

The full interface, from `packages/plugin-sdk/src/adapter.ts`:

```ts
export interface FrameworkAdapter {
  readonly manifest: AgentformPluginManifest;

  validateCompatibility(ir: AgentformIR, context: AdapterContext): Promise<CompatibilityReport>;

  generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject>;

  inspectExisting?(context: ImportContext): Promise<ImportInspection>;

  deploy?(project: GeneratedProject, context: DeploymentContext): Promise<DeploymentResult>;

  destroy?(state: AdapterDeploymentState, context: DestroyContext): Promise<DestroyResult>;
}
```

`manifest`, `validateCompatibility`, and `generate` are the three members every adapter must implement — all six existing adapters do. `inspectExisting`/`deploy`/`destroy` are optional (`?`); as of this build, `inspectExisting` is implemented only by `adapter-openai` and `adapter-langgraph` (`docs/import-guide.md`), and **no adapter implements `deploy` or `destroy`** — `agentform apply` currently materializes a target by writing its generated project to disk, the same output `agentform compile` produces, not by calling a live-deploying `deploy()` that doesn't exist yet. A new adapter is not required to implement any of the three optional hooks; omitting them simply means `agentform import`/a future live `agentform apply` treat that framework the same way every adapter except `adapter-openai`/`adapter-langgraph` is treated today.

## `manifest`

Every plugin type shares one manifest shape, `AgentformPluginManifest` (`packages/plugin-sdk/src/manifest.ts`, walked in full in `docs/plugin-development.md`):

```ts
export interface AgentformPluginManifest {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly type: PluginType;
  readonly capabilities: readonly string[];
  readonly supportedSpecVersions: readonly string[];
}
```

For a `FrameworkAdapter`, `type` is always the literal `'FrameworkAdapter'`. The real reference example, `packages/adapter-openai/src/adapter.ts`'s `OPENAI_ADAPTER_MANIFEST`:

```ts
export const OPENAI_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-openai',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: [
    'agent',
    'tool',
    'handoff',
    'structured-output',
    'guardrails',
    'basic-multi-agent-workflow',
  ],
  supportedSpecVersions: ['v1alpha1'],
};
```

`name` should be the real npm package name (`@agentform/adapter-openai`), not an arbitrary label — `@agentform/registry`'s plugin registry (`docs/plugin-development.md`) indexes plugins by exactly this `name`+`version` pair. `capabilities` is a free-form list, not a closed enum — every existing adapter uses it to name, in plain words, what it can generate (compare `adapter-langgraph`'s, which lists `'conditional-edge'`/`'human-approval'`/`'loop-limit'` where OpenAI's manifest above has none of the three). `apiVersion`/`supportedSpecVersions` track which Agentform specification version(s) this adapter understands — every adapter today supports exactly `['v1alpha1']`, the only specification version that exists.

## `validateCompatibility`

```ts
validateCompatibility(ir: AgentformIR, context: AdapterContext): Promise<CompatibilityReport>;
```

`AdapterContext` carries just `outputDir` (informational, for a compatibility check that wants to reason about relative paths — most adapters' implementations ignore it and only take `ir`). The return shape, `CompatibilityReport` (`packages/plugin-sdk/src/compatibility.ts`):

```ts
export type FeatureSupportLevel = 'supported' | 'partial' | 'unsupported' | 'emulated';

export interface FeatureSupportEntry {
  readonly feature: string;
  readonly level: FeatureSupportLevel;
  readonly detail?: string;
  readonly resourceAddress?: string;
}

export interface CompatibilityReport {
  readonly target: string;
  readonly entries: readonly FeatureSupportEntry[];
  readonly generatedDependencies: Readonly<Record<string, string>>;
  readonly frameworkVersion: string;
  readonly runtimeRequirements: readonly string[];
  readonly securityWarnings: readonly string[];
  readonly hasBlockingIncompatibility: boolean;
}
```

This is the one method the whole contract hinges on: `hasBlockingIncompatibility` must be `true` whenever `entries` contains an `unsupported` level for a feature the IR actually uses — `compile()` (`packages/compiler/src/compile.ts`) checks exactly this flag and refuses to call `generate()` at all when it's set, returning diagnostics only. This is what makes "do not silently ignore unsupported specification fields" (the compiler's central design rule, `docs/compiler-reference.md`) structural rather than a matter of adapter discipline. A new adapter must report **every** agent, tool, and workflow node type actually present in `ir` — not just the ones it happens to support — as one `FeatureSupportEntry` each, so a genuinely unsupported construct always produces a visible, addressed diagnostic rather than a silently incomplete generated project.

The real reference implementation, `validateOpenAiCompatibility` (`packages/adapter-openai/src/compatibility.ts`), is worth reading end to end as a template. It walks `ir.agents`/`ir.tools`/`ir.workflows` and pushes one entry per resource:

```ts
for (const id of ir.agents.keys()) {
  entries.push({
    feature: 'agent',
    level: 'supported',
    resourceAddress: resourceAddress('agent', id),
  });
}

for (const [id, tool] of ir.tools) {
  const address = resourceAddress('tool', id);
  entries.push(
    SUPPORTED_TOOL_TYPES.has(tool.type)
      ? { feature: `tool (${tool.type})`, level: 'supported', resourceAddress: address }
      : {
          feature: `tool (${tool.type})`,
          level: 'unsupported',
          detail: `tool type "${tool.type}" has no OpenAI Agents SDK equivalent yet`,
          resourceAddress: address,
        },
  );
}
```

then appends adapter-wide entries for capabilities that have no per-resource address at all (OpenAI reports `sessions`/`tracing hooks`/`tool restrictions` as `partial` unconditionally — real SDK features the adapter just hasn't generated yet), and finally returns:

```ts
return {
  target: 'openai',
  entries,
  generatedDependencies: {
    '@openai/agents': OPENAI_AGENTS_SDK_VERSION,
    zod: ZOD_VERSION /* ... */,
  },
  frameworkVersion: OPENAI_AGENTS_SDK_VERSION,
  runtimeRequirements: [`node ${NODE_ENGINE_RANGE}`],
  securityWarnings: [
    'Generated code never embeds API keys — the OpenAI SDK reads OPENAI_API_KEY from the environment by default; see .env.example.',
  ],
  hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
};
```

`hasBlockingIncompatibility` is computed, never hand-set — deriving it from `entries` is what keeps the two from silently drifting apart as support is added or removed.

## `generate`

```ts
generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject>;
```

`GenerationContext` carries `outputDir` and `agentformVersion`, plus an optional `sourceHash` — a hash of the original _source_ document(s), distinct from `ir.contentHash` (a hash over the normalized IR, stable across cosmetic source changes like whitespace). `generate()` only ever receives the IR, never the source, so `context.sourceHash` is how a caller that has a real source hash (the CLI, via `@agentform/parser`'s output) passes it through; an adapter should fall back to `ir.contentHash` when it's absent rather than requiring it — every existing adapter does exactly `context.sourceHash ?? ir.contentHash`.

The return shape, `GeneratedProject` (`packages/plugin-sdk/src/generated-project.ts`):

```ts
export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
  readonly sourceResourceAddresses?: readonly string[];
}

export interface GeneratedManifest {
  readonly generatedBy: 'agentform';
  readonly agentformVersion: string;
  readonly specVersion: string;
  readonly adapter: string;
  readonly adapterVersion: string;
  readonly sourceHash: string;
  readonly irHash: string;
  readonly generatedAt: null;
}

export interface GeneratedProject {
  readonly target: string;
  readonly files: readonly GeneratedFile[];
  readonly manifest: GeneratedManifest;
}
```

`GeneratedFile.path` is always relative to the generated project's own root (`src/agents/intake.ts`, never an absolute path) — writing it to disk is the CLI's job (`agentform compile`/`agentform apply`), not the adapter's; `generate()` itself must never touch the filesystem. `sourceResourceAddresses` records which IR resource(s) a file came from (§22's "include source mappings" — this is exactly what `docs/import-guide.md`'s generated-project recognizer reads back later as its `// Source: <address>` header comment, so populating it isn't optional decoration). `generatedAt` is always the literal `null` — never a real timestamp (§22: "for reproducibility, avoid timestamps inside deterministic generated artifacts"); build it with `packages/compiler/src/manifest.ts`'s shared `buildManifest` helper rather than constructing the object literal by hand, so this stays true by construction:

```ts
export function buildManifest(params: BuildManifestParams): GeneratedManifest {
  return {
    generatedBy: 'agentform',
    agentformVersion: params.agentformVersion,
    specVersion: params.specVersion,
    adapter: params.adapter.name,
    adapterVersion: params.adapter.version,
    sourceHash: params.sourceHash,
    irHash: params.irHash,
    generatedAt: null,
  };
}
```

**Determinism is a hard requirement, not a nice-to-have**: every existing adapter has a test asserting that two `generate()` calls against the same IR produce byte-identical files (`docs/security/threat-model.md`'s "Generated-code tampering" entry relies on exactly this). Avoid anything nondeterministic in a generator — object key iteration order, `Date.now()`, random IDs — the same discipline that makes `generatedAt: null` mandatory rather than a real timestamp.

`packages/adapter-openai/src/adapter.ts`'s `generate()` is the concrete reference: it iterates `ir.agents`/`ir.tools`/`ir.workflows`, appends one `GeneratedFile` per resource plus the project's supporting files (`package.json`, `.env.example`, `README.md`, ...), and returns `{ target: 'openai', files, manifest: buildManifest({ adapter: OPENAI_ADAPTER_MANIFEST, agentformVersion: context.agentformVersion, specVersion: 'v1alpha1', sourceHash: context.sourceHash ?? ir.contentHash, irHash: ir.contentHash }) }`.

Every stubbed piece of generated logic (a tool's `execute` body, an agent node's behavior, a model client) must fail loudly at run time — `throw`, `raise NotImplementedError`, or the target language's equivalent — rather than silently doing nothing. This is `docs/compiler-reference.md`'s Security implications guarantee ("a project that hasn't been filled in yet fails fast and obviously when run"), and it applies to a new adapter exactly as it does to the existing six.

## What `compile()` actually calls

`@agentform/compiler`'s `compile(ir, adapter, options)` (`packages/compiler/src/compile.ts`) is the only thing that calls an adapter's `validateCompatibility`/`generate` — never `agentform compile` or `agentform apply` directly:

```text
adapter.validateCompatibility(ir, { outputDir }) → CompatibilityReport
  hasBlockingIncompatibility? → stop, return diagnostics only, no project
adapter.generate(ir, { outputDir, agentformVersion, sourceHash }) → GeneratedProject
scanForSecretLeaks(project.files) → any match? → stop, return diagnostics only, no project
return { project, diagnostics }
```

`scanForSecretLeaks` (reusing `@agentform/policy`'s `detectSecret`/`SECRET_PATTERNS`) runs over every file a new adapter's `generate()` returns, exactly as it does for the existing six — there is no way for an adapter to opt out of this scan, and no adapter needs to implement its own secret-leak defense, since this gate is structural and framework-agnostic. This is also why an adapter must never embed a literal credential value anywhere in generated output, even for a value that started as a `${env.*}`-interpolated field: by the time the compiler sees the IR, every `${env.*}` reference has already been resolved (Phase 3's interpolation runs before schema validation), so the adapter has no visibility into which fields originated from an environment variable — the only safe pattern is the same one every existing adapter follows, documenting a required environment variable in `.env.example`-equivalent output and relying on the target SDK's own env-var conventions, never writing a resolved secret-shaped value into a generated file.

## Registering a new adapter

There is no dynamic plugin loading for framework adapters — `agentform compile`/`agentform apply`/`agentform destroy` all select an adapter through one fixed, in-source lookup table, `ADAPTER_REGISTRY` (`apps/cli/src/lib/generate-artifacts.ts`):

```ts
export const ADAPTER_REGISTRY: Readonly<Record<string, FrameworkAdapter>> = {
  openai: openAiAdapter,
  langgraph: langGraphAdapter,
  microsoft: microsoftAdapter,
  'google-adk': googleAdkAdapter,
  autogen: autoGenAdapter,
  crewai: crewAiAdapter,
};
```

Making a new adapter available to `--target <name>` on `compile`/`apply` (and to `destroy`, which also reads `ADAPTER_REGISTRY` to find the adapter recorded against previously-applied state) means adding one entry here, keyed by whatever string identifies the target — `compile.ts`/`apply.ts` both validate `--target` purely by checking `options.target in ADAPTER_REGISTRY` and list `Object.keys(ADAPTER_REGISTRY)` back in the error message when it isn't, so there's no separate allowlist to update for the flag itself.

Two things beyond that one registry entry are also real requirements, not optional polish:

- **`spec.runtime.target` is a closed schema enum**, not an open string — `packages/schema/src/runtime.ts`'s `frameworkTargetSchema` is `z.enum(['openai', 'langgraph', 'microsoft', 'google-adk', 'autogen', 'crewai'])`. Registering an adapter in `ADAPTER_REGISTRY` alone makes it reachable via `compile --target <name>`/`apply --target <name>` (which override `runtime.target` for that one invocation), but a project that wants to _declare_ the new target as its own `spec.runtime.target` needs that enum extended too, or schema validation rejects the document before `agentform compile` ever runs.
- **`apps/cli`'s own `package.json` lists every adapter package as a real dependency** (`@agentform/adapter-openai`, `@agentform/adapter-langgraph`, and so on) — a new `packages/adapter-<name>/` workspace package needs the same treatment for `apps/cli/src/lib/generate-artifacts.ts`'s import of it to resolve at build time.

## A worked reference implementation

`packages/adapter-openai/src/adapter.ts` is the shortest of the six existing adapters and the one most worth reading start to finish before writing a new one — its `openAiAdapter` object is a complete, real `FrameworkAdapter`: a `manifest` constant, `validateCompatibility` delegating straight to `validateOpenAiCompatibility`, `generate` assembling a `GeneratedFile[]` from the IR's agents/tools/workflows plus fixed project-scaffolding files, and an `inspectExisting` delegating to `inspectOpenAiAgentsProject` (`docs/import-guide.md`). Every other adapter in the repository follows the same shape; the differences between them are entirely in what their `generate()`/`validateCompatibility()` produce for their specific target framework, covered file-by-file in `docs/compiler-reference.md`.

## Scope

- **No adapter implements `deploy()`/`destroy()` yet.** These two optional hooks exist on the interface, but `agentform apply`'s "deployment" step today is writing the generated project to disk — the same thing `agentform compile` does — not calling a live-deploying method. A new adapter is not expected to implement either.
- **No expression evaluator for workflow edge `when` conditions.** Every adapter's conditional-routing code generation is necessarily a stub for this reason (`docs/compiler-reference.md`'s Scope section) — this isn't a gap specific to any one adapter.
- **`inspectExisting` is entirely optional and unrelated to `validateCompatibility`/`generate`.** A new adapter can skip it; doing so simply means `agentform import` never recognizes raw projects written against that framework (`docs/import-guide.md`).
- **Compatibility and generation both operate purely on the IR** — an adapter never sees the original YAML/JSON source, environment overlays, or `${env.*}`/`${var.*}` references (already resolved before the IR exists).

## Security implications

- The secret-leak scan (`scanForSecretLeaks`) applies to every adapter's output unconditionally and cannot be bypassed by an adapter — see What `compile()` actually calls, above.
- A new adapter's generated code must never embed a credential value — see the same section for why this has to be enforced by convention (documenting required environment variables) rather than by tracking which IR fields originated from `${env.*}`, since that provenance is gone by the time the compiler runs.
- Every stub an adapter generates (tool execution, agent logic, model-client construction, routing decisions) must fail loudly when run, never silently succeed or fabricate plausible-looking behavior — see `docs/compiler-reference.md`'s Security implications section, which applies identically to a new adapter.
- `@agentform/plugin-sdk` has no runtime plugin-loading mechanism as of this build (`docs/security/threat-model.md`'s "Compromised plugins" entry) — a new adapter is wired in at the TypeScript source level (`ADAPTER_REGISTRY`) and shipped as part of the `agentform` CLI's own dependency tree, not dynamically loaded from an arbitrary installed package at run time.

## Troubleshooting

- **`agentform compile --target <name>` says "Unknown --target"**: the name isn't a key in `ADAPTER_REGISTRY` — check the exact string used when registering the adapter (`apps/cli/src/lib/generate-artifacts.ts`) matches what was passed on the command line.
- **A project's `runtime.target: <name>` fails schema validation even though the adapter is registered**: `ADAPTER_REGISTRY` and `frameworkTargetSchema` are two separate lists — see Registering a new adapter above. Extending one doesn't extend the other.
- **`agentform compile` reports `AGF5001` (unsupported target feature) for something the new adapter should support**: check `validateCompatibility` actually reports that specific resource as `supported` — an entry that's missing entirely, or present at `unsupported`, blocks generation the same way; `hasBlockingIncompatibility` has to be computed from `entries`, not returned as a fixed `false`.
- **`compile()` returns diagnostics but no `project`, with no `unsupported` entries anywhere**: check the secret-leak scan — a generated file containing a secret-shaped value blocks the result even when compatibility reported everything as supported. Search the adapter's generated output for anything that looks like a credential.
- **Two `generate()` calls against the same IR produce different output**: look for anything nondeterministic — object/Map iteration order that isn't already stable, a timestamp, a random ID. Every existing adapter's test suite asserts byte-identical output for this exact reason.
