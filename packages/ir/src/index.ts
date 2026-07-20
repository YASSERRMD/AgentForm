export type {
  AgentformIR,
  IRApplication,
  IRModel,
  IRTool,
  IRAgent,
  IRWorkflow,
  IRWorkflowNode,
  IRWorkflowEdge,
  IRMemory,
  IREvaluation,
  IRObservability,
  IRDeployment,
  IROutput,
} from './types.js';
export { resourceAddress, type ResourceId } from './identifiers.js';
export { canonicalStringify, computeContentHash } from './hash.js';
export { SEMANTIC_DIAGNOSTIC_CODES } from './codes.js';
export {
  validateSemantics,
  validateReferences,
  validateWorkflowGraph,
  validateAllWorkflowGraphs,
  validateSubworkflows,
  validateToolPermissions,
  validateOutputReferences,
} from './semantic/index.js';
export {
  buildIR,
  IR_VERSION,
  COMPILER_VERSION,
  type BuildIROptions,
  type BuildIRResult,
} from './build.js';

export const PACKAGE_NAME = '@agentform/ir';
export const PACKAGE_VERSION = '0.1.0';
