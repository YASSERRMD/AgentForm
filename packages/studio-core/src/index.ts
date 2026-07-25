/**
 * This barrel is imported by both `apps/studio-server` (Node) and
 * `apps/studio-web` (browser) — verified in Phase 15 that it must stay
 * free of anything that transitively touches a Node-only API, the hard
 * way: `buildSpecDocument` used to live here, and the moment studio-web
 * imported one real (non-type) value from this package, the browser
 * tried to evaluate `@agentform/ir`'s full barrel (via
 * `spec-document.ts`) and crashed on `node:crypto` in dev mode.
 * `buildSpecDocument` now lives only in `./server.js`, imported by
 * `apps/studio-server` alone. See ADR-0018.
 */
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
