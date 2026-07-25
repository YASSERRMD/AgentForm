/**
 * Browser-safe entry point for `@agentform/ir`.
 *
 * The default entry (`index.ts`) re-exports `buildIR`/`computeContentHash`,
 * which transitively import `node:crypto` (`hash.ts`). A production `vite
 * build` tree-shakes that dead code out cleanly, but Vite's dev server
 * evaluates each ES module eagerly and throws the moment `hash.ts` loads —
 * verified empirically before adding this file. This module only re-exports
 * the semantic validators, which have zero dependency on `hash.ts`/`build.ts`,
 * so a browser consumer (Studio's canvas) can run the real, unforked
 * validation logic locally without pulling in any Node-only API.
 */
export {
  validateSemantics,
  validateReferences,
  validateWorkflowGraph,
  validateAllWorkflowGraphs,
  validateSubworkflows,
  validateToolPermissions,
  validateOutputReferences,
  validateLimits,
  DEFAULT_MAX_WORKFLOW_NODES,
  DEFAULT_MAX_WORKFLOW_EDGES,
  DEFAULT_MAX_EXPRESSION_LENGTH,
  type ValidateLimitsOptions,
} from './semantic/index.js';
export { SEMANTIC_DIAGNOSTIC_CODES } from './codes.js';
