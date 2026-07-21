export {
  generateSigningKeyPair,
  signContentHash,
  verifyContentHashSignature,
  type SigningKeyPair,
} from './signing.js';
export { substituteInputs, type InputSubstitutionResult } from './input-substitution.js';
export {
  publishModule,
  resolveModule,
  listModules,
  type ModuleManifest,
  type PublishModuleOptions,
  type ResolvedModule,
  type RegistryModuleEntry,
} from './local-registry.js';
export {
  publishPluginEntry,
  resolvePluginEntry,
  listPlugins,
  type PluginRegistryEntry,
  type PublishPluginOptions,
  type ResolvedPluginEntry,
  type RegistryPluginSummary,
} from './plugin-registry.js';
export {
  resolveProjectModules,
  type ResolveProjectModulesOptions,
  type ResolveProjectModulesResult,
  type ResolvedModuleSummary,
} from './resolve-project-modules.js';
export {
  buildLockfile,
  serializeLockfile,
  parseLockfile,
  LOCKFILE_FORMAT_VERSION,
  type Lockfile,
  type LockedModule,
} from './lockfile.js';
export { REGISTRY_DIAGNOSTIC_CODES } from './codes.js';

export const PACKAGE_NAME = '@agentform/registry';
export const PACKAGE_VERSION = '0.1.0';
