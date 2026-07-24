export type {
  AgenticApplication,
  Diagnostic,
  DiagnosticSeverity,
  SourceLocation,
  SpecDocumentResponse,
  HealthResponse,
} from './types.js';
export { buildSpecDocument, type BuildSpecDocumentOptions } from './spec-document.js';
export {
  applyPatch,
  type SpecPatch,
  type SpecPatchOperation,
  type SpecPatchOperationType,
} from './patch.js';
export { diagnosticSchema, healthResponseSchema, specDocumentResponseSchema } from './http-contracts.js';

export const PACKAGE_NAME = '@agentform/studio-core';
export const PACKAGE_VERSION = '0.1.0';
