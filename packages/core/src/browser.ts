/**
 * Browser-safe entry point for `@agentform/core`.
 *
 * The default entry (`index.ts`) re-exports `resolvePathWithinRoot`/
 * `resolvePathRelativeToFile` (`safe-path.ts`, `node:path`) and
 * `walkSourceFiles` (`walk-source-files.ts`, `node:fs`+`node:path`). A
 * production `vite build` tree-shakes that dead code out cleanly, but
 * Vite's dev server evaluates each ES module eagerly and throws the
 * moment either file loads — the same failure mode `@agentform/ir`'s
 * own `browser.ts` was built to avoid, found here because
 * `@agentform/ir/browser`'s own `subworkflow.ts` dependency imports
 * `findCycle`/`DirectedGraph` from this package's main barrel. This
 * module re-exports only the pure, dependency-free pieces
 * (`duration.ts`, `flatten-maps.ts`, `slugify.ts`, `graph.ts`) so any
 * browser consumer — direct or transitive — can import them safely.
 */
export { parseDurationMs } from './duration.js';
export { flattenMaps } from './flatten-maps.js';
export { slugifyIdentifier } from './slugify.js';
export {
  reachableNodes,
  sinkNodes,
  findCycle,
  topologicalSort,
  type DirectedGraph,
  type DirectedEdge,
  type TopologicalSortResult,
} from './graph.js';
