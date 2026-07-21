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

export interface ImportContext {
  readonly rootDir: string;
}

/**
 * One resource `agentform import` was able to reconstruct (fully or
 * partially) from an existing project. `value` is always a best-effort
 * fragment, never asserted to be schema-valid on its own — `agentform
 * import`'s report and `manualActions` are what carry "here's what's
 * still missing," not this type. `confidence` must never be fabricated
 * as `1` for anything recovered by heuristic source scanning; only an
 * adapter-agnostic recognizer reading Agentform's own generated-file
 * headers (a format the adapter itself controls) can honestly claim
 * that.
 */
export interface ImportCandidate {
  readonly resourceAddress: string;
  readonly kind: string;
  readonly value: Readonly<Record<string, unknown>>;
  /** `0` (pure guess) to `1` (exact). */
  readonly confidence: number;
  readonly detail?: string;
}

/**
 * What `FrameworkAdapter.inspectExisting` returns — §15.12's four
 * required import outputs (candidate resources, unsupported constructs,
 * manual follow-up actions), scoped to what one adapter recognized in
 * its own framework's raw project shape. `recognized: false` means this
 * adapter found no trace of its own framework at all — a normal,
 * expected outcome (`agentform import` tries every adapter that
 * implements this hook and moves on), not an error.
 */
export interface ImportInspection {
  readonly recognized: boolean;
  readonly candidates: readonly ImportCandidate[];
  readonly unsupportedConstructs: readonly string[];
  readonly manualActions: readonly string[];
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
 * The contract every framework adapter implements (§12).
 * `validateCompatibility`/`generate` are implemented by every adapter
 * (Phase 8/9); `inspectExisting` (raw-project recognition for `agentform
 * import`, Phase 11) is implemented only by `adapter-openai` and
 * `adapter-langgraph` per §15.12's limited initial scope — `deploy`/
 * `destroy` stay optional and unimplemented by every adapter until a
 * later phase actually pushes to a live target (§12's interface already
 * marks all three `?`).
 */
export interface FrameworkAdapter {
  readonly manifest: AgentformPluginManifest;

  validateCompatibility(ir: AgentformIR, context: AdapterContext): Promise<CompatibilityReport>;

  generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject>;

  inspectExisting?(context: ImportContext): Promise<ImportInspection>;

  deploy?(project: GeneratedProject, context: DeploymentContext): Promise<DeploymentResult>;

  destroy?(state: AdapterDeploymentState, context: DestroyContext): Promise<DestroyResult>;
}
