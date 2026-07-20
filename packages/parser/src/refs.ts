import path from 'node:path';
import { resolvePathRelativeToFile, UnsafePathError } from '@agentform/core';
import type { Diagnostic, SourceLocation } from '@agentform/diagnostics';
import { PARSER_DIAGNOSTIC_CODES } from './codes.js';
import { loadDocument } from './document.js';
import type { FileSystem } from './filesystem.js';
import { pathToKey, type ResourcePath, type SourceMap } from './types.js';

const DEFAULT_MAX_REFERENCE_DEPTH = 32;

export interface ReferenceResolutionOptions {
  readonly rootDir: string;
  readonly fs: FileSystem;
  readonly maxDepth?: number;
}

export interface ReferenceResolutionResult {
  readonly value: unknown;
  readonly sourceMap: SourceMap;
  readonly diagnostics: readonly Diagnostic[];
  /** Relative paths of every file spliced in via `$ref`, so auto-discovery (`discover.ts`) can skip files an explicit `$ref` already claimed instead of flagging them as duplicates. */
  readonly consumedFiles: ReadonlySet<string>;
}

interface WalkState {
  readonly rootDir: string;
  readonly fs: FileSystem;
  readonly maxDepth: number;
  readonly diagnostics: Diagnostic[];
  readonly sourceMap: Map<string, SourceLocation>;
  readonly consumedFiles: Set<string>;
}

function isSingleKeyStringObject<Key extends string>(
  value: unknown,
  key: Key,
): value is Record<Key, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[key] === 'string'
  );
}

function mergeSourceMap(
  target: Map<string, SourceLocation>,
  prefix: ResourcePath,
  source: SourceMap,
): void {
  const prefixKey = pathToKey(prefix);
  for (const [key, location] of source) {
    target.set(prefixKey ? `${prefixKey}.${key}` : key, location);
  }
}

/** Resolves `relativePath` (from whichever file is currently being walked) and validates it stays within the project root, reporting `UNSAFE_PATH`/`FILE_NOT_FOUND` as diagnostics rather than throwing. Returns `undefined` on any failure. */
function resolveAndCheck(
  relativePath: string,
  currentFile: string,
  fieldPath: ResourcePath,
  state: WalkState,
): { absolute: string; relative: string } | undefined {
  let absolute: string;
  try {
    absolute = resolvePathRelativeToFile(state.rootDir, currentFile, relativePath);
  } catch (error) {
    if (error instanceof UnsafePathError) {
      state.diagnostics.push({
        code: PARSER_DIAGNOSTIC_CODES.UNSAFE_PATH.code,
        severity: 'error',
        message: `Reference "${relativePath}" in "${currentFile}" resolves outside the project root`,
        path: fieldPath,
      });
      return undefined;
    }
    throw error;
  }

  const relative = path.relative(state.rootDir, absolute);

  if (!state.fs.exists(absolute)) {
    state.diagnostics.push({
      code: PARSER_DIAGNOSTIC_CODES.FILE_NOT_FOUND.code,
      severity: 'error',
      message: `Reference "${relativePath}" in "${currentFile}" points to a file that does not exist: ${relative}`,
      path: fieldPath,
    });
    return undefined;
  }

  return { absolute, relative };
}

function resolveRef(
  refSpec: string,
  currentFile: string,
  fieldPath: ResourcePath,
  visited: readonly string[],
  depth: number,
  state: WalkState,
): unknown {
  if (depth > state.maxDepth) {
    state.diagnostics.push({
      code: PARSER_DIAGNOSTIC_CODES.MAX_DEPTH_EXCEEDED.code,
      severity: 'error',
      message: `$ref chain exceeds the maximum depth of ${state.maxDepth} while resolving "${refSpec}"`,
      path: fieldPath,
    });
    return undefined;
  }

  const resolvedPath = resolveAndCheck(refSpec, currentFile, fieldPath, state);
  if (!resolvedPath) {
    return undefined;
  }
  const { absolute: target, relative: relativeTarget } = resolvedPath;

  if (visited.includes(relativeTarget)) {
    state.diagnostics.push({
      code: PARSER_DIAGNOSTIC_CODES.REFERENCE_CYCLE.code,
      severity: 'error',
      message: `$ref cycle detected: ${[...visited, relativeTarget].join(' -> ')}`,
      path: fieldPath,
    });
    return undefined;
  }

  state.consumedFiles.add(relativeTarget);
  const doc = loadDocument(state.fs.readFile(target), relativeTarget);
  state.diagnostics.push(...doc.diagnostics);
  mergeSourceMap(state.sourceMap, fieldPath, doc.sourceMap);

  if (doc.diagnostics.some((d) => d.severity === 'error')) {
    return undefined;
  }

  return resolveNode(
    doc.value,
    relativeTarget,
    fieldPath,
    [...visited, relativeTarget],
    depth + 1,
    state,
  );
}

/** `{ file: "<path>" }` (e.g. an agent's `instructions`) becomes `{ text: "<file contents>" }`. Does not recurse into the file's content — it's plain text, not more Agentform document structure. */
function resolveFileContent(
  relativePath: string,
  currentFile: string,
  fieldPath: ResourcePath,
  state: WalkState,
): unknown {
  const resolved = resolveAndCheck(relativePath, currentFile, fieldPath, state);
  return resolved ? { text: state.fs.readFile(resolved.absolute) } : undefined;
}

/** `{ schemaRef: "<path>" }` (a model's `responseFormat`) becomes `{ schema: <parsed JSON/YAML> }`. Like `resolveFileContent`, does not recurse further — a JSON Schema file's own `$ref`s belong to the JSON Schema spec, not Agentform's. */
function resolveSchemaRefContent(
  relativePath: string,
  currentFile: string,
  fieldPath: ResourcePath,
  state: WalkState,
): unknown {
  const resolved = resolveAndCheck(relativePath, currentFile, fieldPath, state);
  if (!resolved) {
    return undefined;
  }
  const doc = loadDocument(state.fs.readFile(resolved.absolute), relativePath);
  state.diagnostics.push(...doc.diagnostics);
  return { schema: doc.value };
}

function resolveNode(
  value: unknown,
  currentFile: string,
  fieldPath: ResourcePath,
  visited: readonly string[],
  depth: number,
  state: WalkState,
): unknown {
  if (isSingleKeyStringObject(value, '$ref')) {
    return resolveRef(value.$ref, currentFile, fieldPath, visited, depth, state);
  }

  if (isSingleKeyStringObject(value, 'file')) {
    return resolveFileContent(value.file, currentFile, fieldPath, state);
  }

  if (isSingleKeyStringObject(value, 'schemaRef')) {
    return resolveSchemaRefContent(value.schemaRef, currentFile, fieldPath, state);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNode(item, currentFile, [...fieldPath, index], visited, depth, state),
    );
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = resolveNode(child, currentFile, [...fieldPath, key], visited, depth, state);
    }
    return result;
  }

  return value;
}

/**
 * Walks `value` (already parsed from `entryFile`) resolving every
 * reference marker in one pass: `{ $ref: "<path>" }` splices in the
 * resolved content of another file (recursively — a referenced file's own
 * `$ref`s are followed too, with cycle detection and a maximum chain
 * depth against §19 "Denial-of-service through recursive references");
 * `{ file: "<path>" }` and `{ schemaRef: "<path>" }` inline a prompt file
 * or a JSON Schema file (§7 "Resolve prompt files", "Resolve schema
 * files"). All three resolve relative to *whichever file the containing
 * value currently lives in* — not always the entry file — which is why
 * this is one walk rather than separate passes: only this walk correctly
 * tracks "currentFile" as it descends into `$ref`-loaded content.
 */
export function resolveReferences(
  value: unknown,
  entryFile: string,
  sourceMap: SourceMap,
  options: ReferenceResolutionOptions,
): ReferenceResolutionResult {
  const state: WalkState = {
    rootDir: path.resolve(options.rootDir),
    fs: options.fs,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_REFERENCE_DEPTH,
    diagnostics: [],
    sourceMap: new Map(sourceMap),
    consumedFiles: new Set(),
  };

  const resolvedValue = resolveNode(value, entryFile, [], [entryFile], 0, state);

  return {
    value: resolvedValue,
    sourceMap: state.sourceMap,
    diagnostics: state.diagnostics,
    consumedFiles: state.consumedFiles,
  };
}
