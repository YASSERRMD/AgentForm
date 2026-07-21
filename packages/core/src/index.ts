export { resolvePathWithinRoot, resolvePathRelativeToFile, UnsafePathError } from './safe-path.js';
export { parseDurationMs } from './duration.js';
export { flattenMaps } from './flatten-maps.js';
export { slugifyIdentifier } from './slugify.js';
export {
  walkSourceFiles,
  type SourceFile,
  type WalkSourceFilesOptions,
} from './walk-source-files.js';
export {
  reachableNodes,
  sinkNodes,
  findCycle,
  topologicalSort,
  type DirectedGraph,
  type DirectedEdge,
  type TopologicalSortResult,
} from './graph.js';

export const PACKAGE_NAME = '@agentform/core';
export const PACKAGE_VERSION = '0.1.0';
