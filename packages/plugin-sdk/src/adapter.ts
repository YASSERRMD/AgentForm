import type { AgentformIR } from '@agentform/ir';
import type { CompatibilityReport } from './compatibility.js';
import type { GeneratedProject } from './generated-project.js';
import type { AgentformPluginManifest } from './manifest.js';

export interface AdapterContext {
  /** Where `generate()` would write, informational for a compatibility check that wants to reason about relative paths. */
  readonly outputDir: string;
}

export interface GenerationContext {
  readonly outputDir: string;
  readonly agentformVersion: string;
  /**
   * A hash of the original source document(s), distinct from `ir.contentHash`
   * (which is over the *normalized* IR — stable across cosmetic source
   * changes like whitespace or key order). Optional because `generate()`
   * only ever receives the IR, never the source — a caller that has a real
   * source hash (the CLI, from `@agentform/parser`'s output) should pass
   * it for §22's manifest `sourceHash` field; an adapter should fall back
   * to `ir.contentHash` when it's absent rather than requiring it.
   */
  readonly sourceHash?: string;
}

/**
 * Forward-looking placeholder shapes for `FrameworkAdapter`'s optional
 * `inspectExisting`/`deploy`/`destroy` members — §12 declares these on the
 * interface, but nothing calls them until `agentform import`/`apply`/
 * `destroy` exist (Phase 11). Kept deliberately minimal rather than
 * fleshed out now: designing their real shape ahead of the phase that
 * actually implements deploy/destroy risks guessing wrong and having to
 * break it later.
 */
export interface ImportContext {
  readonly rootDir: string;
}

export interface ImportCandidate {
  readonly resourceAddress: string;
  readonly kind: string;
  readonly detail?: string;
}

export interface DeploymentContext {
  readonly environment: string;
}

export interface DeploymentResult {
  readonly deploymentId: string;
  readonly succeeded: boolean;
}

export interface AdapterDeploymentState {
  readonly deploymentId: string;
}

export interface DestroyContext {
  readonly environment: string;
}

export interface DestroyResult {
  readonly succeeded: boolean;
}

/**
 * The contract every framework adapter implements (§12). Only
 * `validateCompatibility`/`generate` are implemented by any adapter as of
 * Phase 8 — `inspectExisting`/`deploy`/`destroy` stay optional and
 * unimplemented until the phases that need them (§12's own interface
 * already marks them `?`).
 */
export interface FrameworkAdapter {
  readonly manifest: AgentformPluginManifest;

  validateCompatibility(ir: AgentformIR, context: AdapterContext): Promise<CompatibilityReport>;

  generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject>;

  inspectExisting?(context: ImportContext): Promise<ImportCandidate>;

  deploy?(project: GeneratedProject, context: DeploymentContext): Promise<DeploymentResult>;

  destroy?(state: AdapterDeploymentState, context: DestroyContext): Promise<DestroyResult>;
}
