export { COMPILER_DIAGNOSTIC_CODES } from './codes.js';
export { buildManifest, type BuildManifestParams } from './manifest.js';
export { compatibilityReportToDiagnostics } from './compatibility-diagnostics.js';
export { scanForSecretLeaks, type SecretLeak } from './secret-scan.js';
export { compile, type CompileOptions, type CompileResult } from './compile.js';
export { toIdentifier, toPascalCase, generatedFileHeader } from './codegen-utils.js';

export const PACKAGE_NAME = '@agentform/compiler';
export const PACKAGE_VERSION = '0.1.0';
