import path from 'node:path';
import { resolvePathWithinRoot, UnsafePathError } from '@agentform/core';
import type { Diagnostic, SourceLocation } from '@agentform/diagnostics';
import { PARSER_DIAGNOSTIC_CODES } from './codes.js';
import {
  discoverEntryFile,
  discoverResourceCollection,
  type ResourceCollection,
} from './discover.js';
import { loadDocument } from './document.js';
import { mergeOverlay } from './overlays.js';
import { resolveReferences } from './refs.js';
import { pathToKey, type SourceMap } from './types.js';
import { interpolateDocument, type InterpolateDocumentOptions } from './variables.js';
import type { FileSystem } from './filesystem.js';

const RESOURCE_COLLECTIONS: readonly ResourceCollection[] = ['agents', 'tools', 'workflows'];

export interface LoadProjectOptions {
  readonly rootDir: string;
  readonly fs: FileSystem;
  readonly environment?: string;
  readonly maxReferenceDepth?: number;
  readonly maxSourceFileSizeBytes?: number;
  readonly env?: InterpolateDocumentOptions['env'];
  readonly variableOverrides?: InterpolateDocumentOptions['variableOverrides'];
}

export interface LoadProjectResult {
  readonly value: unknown;
  readonly sourceMap: SourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function existingResourceKeys(value: unknown, collection: ResourceCollection): Set<string> {
  if (!isRecord(value) || !isRecord(value.spec) || !isRecord(value.spec[collection])) {
    return new Set();
  }
  return new Set(Object.keys(value.spec[collection]));
}

function withResourceCollection(
  value: unknown,
  collection: ResourceCollection,
  resources: Record<string, unknown>,
): unknown {
  if (Object.keys(resources).length === 0) {
    return value;
  }
  const base = isRecord(value) ? value : {};
  const spec = isRecord(base.spec) ? base.spec : {};
  const existing = isRecord(spec[collection]) ? (spec[collection] as Record<string, unknown>) : {};
  return { ...base, spec: { ...spec, [collection]: { ...existing, ...resources } } };
}

function loadAndResolve(
  entryRelativePath: string,
  options: LoadProjectOptions,
): {
  value: unknown;
  sourceMap: Map<string, SourceLocation>;
  diagnostics: Diagnostic[];
  consumedFiles: ReadonlySet<string>;
} {
  const doc = loadDocument(
    options.fs.readFile(path.join(options.rootDir, entryRelativePath)),
    entryRelativePath,
    { maxSourceFileSizeBytes: options.maxSourceFileSizeBytes },
  );
  const diagnostics: Diagnostic[] = [...doc.diagnostics];

  if (diagnostics.some((d) => d.severity === 'error')) {
    return {
      value: undefined,
      sourceMap: new Map(doc.sourceMap),
      diagnostics,
      consumedFiles: new Set(),
    };
  }

  const resolved = resolveReferences(doc.value, entryRelativePath, doc.sourceMap, {
    rootDir: options.rootDir,
    fs: options.fs,
    maxDepth: options.maxReferenceDepth,
    maxSourceFileSizeBytes: options.maxSourceFileSizeBytes,
  });
  diagnostics.push(...resolved.diagnostics);

  return {
    value: resolved.value,
    sourceMap: new Map(resolved.sourceMap),
    diagnostics,
    consumedFiles: resolved.consumedFiles,
  };
}

/**
 * Loads a full Agentform project: finds the entry file (§7), resolves
 * `$ref`/`file`/`schemaRef` references (`refs.ts` — also applied to each
 * auto-discovered file below, so a reference nested inside one resolves
 * correctly too), auto-discovers `agents/`/`tools/`/`workflows/`
 * directory resources (duplicate identifiers reported and skipped rather
 * than silently overwritten), applies an environment overlay when
 * requested (§20 — merge-by-identifier for resources, replace for
 * arrays), and finally interpolates `${env.*}`/`${var.*}`/`${local.*}`.
 * Every stage collects diagnostics rather than throwing; check
 * `diagnostics` for `severity: "error"` entries before trusting `value`.
 */
export function loadProject(options: LoadProjectOptions): LoadProjectResult {
  const entry = discoverEntryFile(options.rootDir, options.fs);
  if (!entry.file) {
    return { value: undefined, sourceMap: new Map(), diagnostics: entry.diagnostics };
  }

  const base = loadAndResolve(entry.file, options);
  const diagnostics: Diagnostic[] = [...base.diagnostics];
  let value = base.value;
  const sourceMap = base.sourceMap;

  if (!diagnostics.some((d) => d.severity === 'error')) {
    for (const collection of RESOURCE_COLLECTIONS) {
      const discovered = discoverResourceCollection(
        collection,
        options.rootDir,
        options.fs,
        existingResourceKeys(value, collection),
        base.consumedFiles,
        options.maxReferenceDepth,
        options.maxSourceFileSizeBytes,
      );
      diagnostics.push(...discovered.diagnostics);
      value = withResourceCollection(value, collection, discovered.resources);
      for (const [key, location] of discovered.sourceMap) {
        sourceMap.set(pathToKey(['spec', ...key.split('.')]), location);
      }
    }
  }

  if (options.environment && !diagnostics.some((d) => d.severity === 'error')) {
    const overlayRelativePath = path.join('environments', `${options.environment}.yaml`);
    let overlayAbsolutePath: string | undefined;
    try {
      overlayAbsolutePath = resolvePathWithinRoot(options.rootDir, overlayRelativePath);
    } catch (error) {
      if (!(error instanceof UnsafePathError)) {
        throw error;
      }
      diagnostics.push({
        code: PARSER_DIAGNOSTIC_CODES.UNSAFE_PATH.code,
        severity: 'error',
        message: `--environment "${options.environment}" resolves outside the project root`,
        path: ['spec', 'runtime', 'environment'],
      });
    }

    if (overlayAbsolutePath && options.fs.exists(overlayAbsolutePath)) {
      const overlay = loadAndResolve(overlayRelativePath, options);
      diagnostics.push(...overlay.diagnostics);
      if (!overlay.diagnostics.some((d) => d.severity === 'error')) {
        value = mergeOverlay(value, overlay.value);
        for (const [key, location] of overlay.sourceMap) {
          sourceMap.set(key, location);
        }
      }
    }
  }

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { value: undefined, sourceMap, diagnostics };
  }

  const interpolated = interpolateDocument(value, {
    env: options.env,
    variableOverrides: options.variableOverrides,
  });
  diagnostics.push(...interpolated.diagnostics);

  return {
    value: diagnostics.some((d) => d.severity === 'error') ? undefined : interpolated.value,
    sourceMap,
    diagnostics,
  };
}
