export { resolvePathWithinRoot, resolvePathRelativeToFile, UnsafePathError } from './safe-path.js';
export { parseDurationMs } from './duration.js';
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
