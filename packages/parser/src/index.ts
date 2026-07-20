export { loadDocument } from './document.js';
export {
  resolveReferences,
  type ReferenceResolutionOptions,
  type ReferenceResolutionResult,
} from './refs.js';
export { mergeOverlay } from './overlays.js';
export {
  interpolateString,
  interpolateValue,
  type InterpolationNamespace,
  type InterpolationResolver,
} from './interpolation.js';
export {
  interpolateDocument,
  resolveVariables,
  resolveLocals,
  type InterpolateDocumentOptions,
  type VariableDeclarations,
  type LocalDeclarations,
} from './variables.js';
export {
  discoverEntryFile,
  discoverResourceCollection,
  DEFAULT_SOURCE_FILENAMES,
  type ResourceCollection,
  type DiscoveredResources,
} from './discover.js';
export { loadProject, type LoadProjectOptions, type LoadProjectResult } from './project.js';
export { nodeFileSystem, createInMemoryFileSystem, type FileSystem } from './filesystem.js';
export { PARSER_DIAGNOSTIC_CODES } from './codes.js';
export { pathToKey, type ResourcePath, type SourceMap, type ParsedDocument } from './types.js';

export const PACKAGE_NAME = '@agentform/parser';
export const PACKAGE_VERSION = '0.1.0';
