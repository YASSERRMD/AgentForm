import type { Diagnostic } from '@agentform/diagnostics';
import { type AgentformIR, buildIR } from '@agentform/ir';
import { loadProject, nodeFileSystem } from '@agentform/parser';
import { resolveProjectModules, type ResolvedModuleSummary } from '@agentform/registry';
import type { AgenticApplication } from '@agentform/schema';
import { registryRootFor, trustedRegistryPublicKeyPem } from './registry.js';

export interface LoadAndBuildOptions {
  readonly rootDir: string;
  readonly environment?: string;
}

export interface LoadAndBuildResult {
  readonly ir?: AgentformIR;
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
  readonly resolvedModules: readonly ResolvedModuleSummary[];
}

/**
 * The shared `loadProject → resolveProjectModules → buildIR` pipeline
 * every diagnostics-producing command (`validate`, `inspect`, `graph`,
 * `plan`, `apply`, ...) runs. Stops after parsing if parsing itself
 * failed — schema/semantic validation over a document that didn't even
 * parse would just produce confusing secondary diagnostics. Module
 * resolution (`@agentform/registry`, Phase 12) runs *before* schema
 * validation and only when `spec.modules` is actually present — a
 * module-provided agent/tool/workflow is merged into `project.value`
 * first, so it goes through exactly the same schema/semantic validation
 * an inline-declared resource does, never a separate, weaker path. A
 * module resolution failure (not published, tampered, missing required
 * input) is reported as an error diagnostic but does not itself stop the
 * pipeline — the rest of the document (and any *other* module) still
 * gets validated, the same "collect everything, don't stop at the first
 * problem" discipline every earlier stage already follows.
 */
export function loadAndBuildIR(options: LoadAndBuildOptions): LoadAndBuildResult {
  const project = loadProject({
    rootDir: options.rootDir,
    fs: nodeFileSystem,
    environment: options.environment,
  });

  if (project.diagnostics.some((d) => d.severity === 'error')) {
    return { diagnostics: project.diagnostics, resolvedModules: [] };
  }

  const modules = resolveProjectModules(project.value, {
    registryRoot: registryRootFor(),
    trustedPublicKeyPem: trustedRegistryPublicKeyPem(),
  });

  const irResult = buildIR(modules.value, { sourceMap: project.sourceMap });
  return {
    ir: irResult.ir,
    application: irResult.application,
    diagnostics: [...project.diagnostics, ...modules.diagnostics, ...irResult.diagnostics],
    resolvedModules: modules.resolvedModules,
  };
}
