export { resolvePathWithinRoot, resolvePathRelativeToFile, UnsafePathError } from './safe-path.js';
export {
  reachableNodes,
  sinkNodes,
  findCycle,
  type DirectedGraph,
  type DirectedEdge,
} from './graph.js';

export const PACKAGE_NAME = '@agentform/core';
export const PACKAGE_VERSION = '0.1.0';
