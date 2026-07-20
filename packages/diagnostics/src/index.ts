export type { DiagnosticSeverity, SourceLocation, Diagnostic } from './types.js';
export { type DiagnosticCodeDefinition, defineDiagnosticCodes } from './codes.js';
export { DiagnosticError, formatDiagnostic } from './error.js';

export const PACKAGE_NAME = '@agentform/diagnostics';
export const PACKAGE_VERSION = '0.1.0';
