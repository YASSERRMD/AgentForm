import type { AgenticApplication } from './types.js';
import { applyPatch, type SpecPatch } from './patch.js';
import { findUngatedDestructiveToolNodes } from './workflow-risk.js';

export type PatchImpactLevel = 'low' | 'medium' | 'high';

/**
 * A structural, always-available impact signal for an unapplied
 * `SpecPatch` preview (GenAI/chat proposals, Phase 17-18) — deliberately
 * NOT `@agentform/planner`'s `classifyRisk`/`PlanRisk`. That classifies a
 * resource's operation relative to previously-*deployed* state, which
 * Studio has no access to (see `workflow-risk.ts`'s own note on this same
 * distinction); faking an approximation of it here could disagree with
 * what `agentform plan` would actually say once state is involved, which
 * is worse than an honestly narrower signal.
 *
 * This instead answers two questions available from the patch and the
 * document it would apply to, nothing more: does the diff remove or
 * redefine something that already exists (`remove` outranks `replace`
 * outranks a purely additive patch), and — reusing
 * `findUngatedDestructiveToolNodes` exactly as `WorkflowCanvas` already
 * does — would the resulting spec contain a destructive tool call with no
 * human approval gating it. `currentApplication` is optional so this can
 * still classify a patch preview with no document loaded yet; the
 * destructive-tool check simply doesn't run in that case.
 */
export function classifyPatchImpact(
  patch: SpecPatch,
  currentApplication?: AgenticApplication,
): PatchImpactLevel {
  let impact: PatchImpactLevel = 'low';
  if (patch.some((operation) => operation.op === 'replace')) {
    impact = 'medium';
  }
  if (patch.some((operation) => operation.op === 'remove')) {
    impact = 'high';
  }

  if (currentApplication) {
    const proposed = applyPatch(currentApplication, patch);
    const tools = proposed.spec.tools ?? {};
    for (const workflow of Object.values(proposed.spec.workflows)) {
      if (findUngatedDestructiveToolNodes(workflow, tools).length > 0) {
        impact = 'high';
        break;
      }
    }
  }

  return impact;
}
