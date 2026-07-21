import type { Diagnostic } from '@agentform/diagnostics';
import type { ModuleDefinitionSpec } from '@agentform/schema';
import { REGISTRY_DIAGNOSTIC_CODES } from './codes.js';
import { substituteInputs } from './input-substitution.js';
import { resolveModule, type ResolvedModule } from './local-registry.js';

const MERGED_COLLECTIONS = ['models', 'tools', 'agents', 'workflows', 'memory'] as const;

export interface ResolveProjectModulesOptions {
  readonly registryRoot: string;
  readonly trustedPublicKeyPem?: string;
}

export interface ResolvedModuleSummary {
  readonly id: string;
  readonly source: string;
  readonly version: string;
  readonly contentHash: string;
  readonly signatureVerified: boolean;
}

export interface ResolveProjectModulesResult {
  readonly value: unknown;
  readonly diagnostics: readonly Diagnostic[];
  readonly resolvedModules: readonly ResolvedModuleSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolvedInputs(
  moduleId: string,
  definitionSpec: ModuleDefinitionSpec,
  suppliedInputs: Readonly<Record<string, unknown>>,
): { inputs: Record<string, unknown>; diagnostics: Diagnostic[] } {
  const inputs: Record<string, unknown> = {};
  const diagnostics: Diagnostic[] = [];

  for (const [name, declaration] of Object.entries(definitionSpec.inputs ?? {})) {
    if (name in suppliedInputs) {
      inputs[name] = suppliedInputs[name];
    } else if ('default' in declaration) {
      inputs[name] = declaration.default;
    } else {
      diagnostics.push({
        code: REGISTRY_DIAGNOSTIC_CODES.MODULE_MISSING_REQUIRED_INPUT.code,
        severity: 'error',
        message: `Module "${moduleId}" input "${name}" has no default and was not supplied`,
        path: ['spec', 'modules', moduleId, 'inputs', name],
      });
    }
  }

  return { inputs, diagnostics };
}

/**
 * Merges every resource in `definitionSpec`'s collections into
 * `accumulator` (mutated in place — each module processed in
 * declaration order sees every prior module's resources too, so
 * module-vs-module collisions are caught the same way module-vs-inline
 * ones are), substituting `${input.*}` first. A colliding identifier is
 * reported and skipped — the resource already present (whether
 * hand-authored or from an earlier module) wins, the same "explicit/
 * earlier wins" precedent `@agentform/parser`'s auto-discovery already
 * established for file-discovered resources.
 */
function mergeModuleResources(
  moduleId: string,
  definitionSpec: ModuleDefinitionSpec,
  inputs: Readonly<Record<string, unknown>>,
  accumulator: Record<string, unknown>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const collection of MERGED_COLLECTIONS) {
    const rawResources = definitionSpec[collection as keyof ModuleDefinitionSpec] as
      Record<string, unknown> | undefined;
    if (!rawResources) {
      continue;
    }

    const existing = isRecord(accumulator[collection])
      ? (accumulator[collection] as Record<string, unknown>)
      : {};
    const merged: Record<string, unknown> = { ...existing };

    for (const [id, rawResource] of Object.entries(rawResources)) {
      if (id in existing) {
        diagnostics.push({
          code: REGISTRY_DIAGNOSTIC_CODES.MODULE_RESOURCE_COLLISION.code,
          severity: 'error',
          message: `Module "${moduleId}" declares ${collection.slice(0, -1)} "${id}", which already exists — the existing declaration wins`,
          path: ['spec', collection, id],
        });
        continue;
      }
      const substituted = substituteInputs(rawResource, inputs);
      for (const missingInput of substituted.missing) {
        diagnostics.push({
          code: REGISTRY_DIAGNOSTIC_CODES.MODULE_MISSING_REQUIRED_INPUT.code,
          severity: 'error',
          message: `Module "${moduleId}"'s "${id}" references "\${input.${missingInput}}", which has no value`,
          path: ['spec', collection, id],
        });
      }
      merged[id] = substituted.value;
    }

    accumulator[collection] = merged;
  }

  return diagnostics;
}

function verifySignature(
  moduleId: string,
  resolved: ResolvedModule,
  trustedPublicKeyPem: string | undefined,
): Diagnostic | undefined {
  if (!resolved.manifest.signature) {
    return trustedPublicKeyPem
      ? {
          code: REGISTRY_DIAGNOSTIC_CODES.MODULE_SIGNATURE_UNVERIFIED.code,
          severity: 'warning',
          message: `Module "${moduleId}" is unsigned, but a trusted public key is configured — its provenance cannot be verified`,
          path: ['spec', 'modules', moduleId],
        }
      : undefined;
  }
  if (!trustedPublicKeyPem) {
    return undefined;
  }
  if (!resolved.signatureVerified) {
    return {
      code: REGISTRY_DIAGNOSTIC_CODES.MODULE_SIGNATURE_UNVERIFIED.code,
      severity: 'error',
      message: `Module "${moduleId}"'s signature does not verify against the configured trusted key`,
      path: ['spec', 'modules', moduleId],
    };
  }
  return undefined;
}

/**
 * Resolves every `spec.modules` entry in `value` against the local
 * registry at `options.registryRoot`, merging each module's resources
 * into `value`'s own `spec.{models,tools,agents,workflows,memory}` —
 * the step that turns a `modules:` *declaration* into resources
 * `buildIR` actually sees. `spec.modules` itself is left untouched in
 * the returned value (unlike `variables`/`locals`, which
 * `interpolateDocument` strips — a module reference is real, inspectable
 * project metadata, not a resolution-only section). A module that fails
 * to resolve (not published, tampered, invalid, unverified signature)
 * contributes error diagnostics and is skipped entirely rather than
 * partially merged.
 */
export function resolveProjectModules(
  value: unknown,
  options: ResolveProjectModulesOptions,
): ResolveProjectModulesResult {
  if (!isRecord(value) || !isRecord(value.spec) || !isRecord(value.spec.modules)) {
    return { value, diagnostics: [], resolvedModules: [] };
  }

  const modules = value.spec.modules as Record<
    string,
    { source: string; version: string; inputs?: Record<string, unknown> }
  >;
  const diagnostics: Diagnostic[] = [];
  const resolvedModules: ResolvedModuleSummary[] = [];
  const accumulator: Record<string, unknown> = { ...value.spec };

  for (const [moduleId, reference] of Object.entries(modules)) {
    let resolved: ResolvedModule;
    try {
      resolved = resolveModule(
        options.registryRoot,
        reference.source,
        reference.version,
        options.trustedPublicKeyPem,
      );
    } catch (error) {
      const message = (error as Error).message;
      const code = message.includes('integrity check')
        ? REGISTRY_DIAGNOSTIC_CODES.MODULE_INTEGRITY_FAILURE.code
        : message.includes('schema validation')
          ? REGISTRY_DIAGNOSTIC_CODES.MODULE_SCHEMA_INVALID.code
          : REGISTRY_DIAGNOSTIC_CODES.MODULE_NOT_FOUND.code;
      diagnostics.push({
        code,
        severity: 'error',
        message,
        path: ['spec', 'modules', moduleId],
      });
      continue;
    }

    const signatureDiagnostic = verifySignature(moduleId, resolved, options.trustedPublicKeyPem);
    if (signatureDiagnostic) {
      diagnostics.push(signatureDiagnostic);
      if (signatureDiagnostic.severity === 'error') {
        continue;
      }
    }

    const { inputs, diagnostics: inputDiagnostics } = resolvedInputs(
      moduleId,
      resolved.definition.spec,
      reference.inputs ?? {},
    );
    diagnostics.push(...inputDiagnostics);

    diagnostics.push(
      ...mergeModuleResources(moduleId, resolved.definition.spec, inputs, accumulator),
    );

    resolvedModules.push({
      id: moduleId,
      source: reference.source,
      version: reference.version,
      contentHash: resolved.manifest.contentHash,
      signatureVerified: resolved.signatureVerified,
    });
  }

  return {
    value: { ...value, spec: accumulator },
    diagnostics,
    resolvedModules,
  };
}
