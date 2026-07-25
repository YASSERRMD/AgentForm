export type {
  AgenticApplication,
  Diagnostic,
  DiagnosticSeverity,
  SourceLocation,
  SpecDocumentResponse,
  HealthResponse,
  PatchSpecRequest,
  PatchSpecResponse,
  Tool,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from './types.js';
export { buildSpecDocument, type BuildSpecDocumentOptions } from './spec-document.js';
export {
  applyPatch,
  type SpecPatch,
  type SpecPatchOperation,
  type SpecPatchOperationType,
} from './patch.js';
export {
  generateAllResourceFormSchemas,
  generateResourceFormSchema,
  generateWorkflowNodeFormSchema,
  RESOURCE_TYPES,
  type ResourceFormSchema,
  type ResourceType,
} from './form-schema.js';
export {
  diagnosticSchema,
  formSchemasResponseSchema,
  healthResponseSchema,
  patchSpecRequestSchema,
  patchSpecResponseSchema,
  resourceFormSchemaSchema,
  specDocumentResponseSchema,
  specPatchOperationSchema,
} from './http-contracts.js';
export { findUngatedDestructiveToolNodes } from './workflow-risk.js';

export const PACKAGE_NAME = '@agentform/studio-core';
export const PACKAGE_VERSION = '0.1.0';
