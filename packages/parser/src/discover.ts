import path from 'node:path';
import type { Diagnostic } from '@agentform/diagnostics';
import { PARSER_DIAGNOSTIC_CODES } from './codes.js';
import { loadDocument } from './document.js';
import type { FileSystem } from './filesystem.js';
import { resolveReferences } from './refs.js';
import { pathToKey, type SourceMap } from './types.js';

export const DEFAULT_SOURCE_FILENAMES = [
  'agentform.yaml',
  'agentform.yml',
  'agentform.json',
] as const;

/**
 * Finds the project's entry file among the supported default filenames
 * (§7). Exactly one must exist — having none is "no project here";
 * having more than one is ambiguous and rejected rather than silently
 * picking one, since that pick would be unreproducible across machines
 * with a different filesystem directory-listing order.
 */
export function discoverEntryFile(
  rootDir: string,
  fs: FileSystem,
): { file?: string; diagnostics: Diagnostic[] } {
  const present = DEFAULT_SOURCE_FILENAMES.filter((name) => fs.exists(path.join(rootDir, name)));

  if (present.length === 0) {
    return {
      diagnostics: [
        {
          code: PARSER_DIAGNOSTIC_CODES.FILE_NOT_FOUND.code,
          severity: 'error',
          message: `No Agentform source file found in "${rootDir}" (expected one of ${DEFAULT_SOURCE_FILENAMES.join(', ')})`,
        },
      ],
    };
  }

  if (present.length > 1) {
    return {
      diagnostics: [
        {
          code: PARSER_DIAGNOSTIC_CODES.DUPLICATE_RESOURCE.code,
          severity: 'error',
          message: `Multiple Agentform source files found in "${rootDir}" (${present.join(', ')}); keep exactly one`,
        },
      ],
    };
  }

  return { file: present[0], diagnostics: [] };
}

const AUTO_DISCOVER_EXTENSIONS = ['.yaml', '.yml', '.json'];

export type ResourceCollection = 'agents' | 'tools' | 'workflows';

export interface DiscoveredResources {
  readonly resources: Record<string, unknown>;
  readonly sourceMap: SourceMap;
  readonly diagnostics: Diagnostic[];
}

/**
 * Auto-discovers resources from a per-collection directory (`agents/`,
 * `tools/`, `workflows/` — §7's "Support multi-file projects" layout),
 * keyed by each file's basename. A file already spliced in via an
 * explicit `$ref` (`consumedFiles`, from `resolveReferences`) is skipped
 * silently — that's the *same* resource, intentionally referenced, not a
 * collision (this is exactly the pattern §7's own example shows: `$ref:
 * ./agents/researcher.yaml` pointing straight into the auto-discovered
 * `agents/` directory). A file whose basename collides with an
 * `existingKeys` entry through some *other* route (a different file, or
 * an inline declaration) is a genuine duplicate and is reported+skipped —
 * the explicit declaration wins rather than being silently overwritten.
 */
export function discoverResourceCollection(
  collection: ResourceCollection,
  rootDir: string,
  fs: FileSystem,
  existingKeys: ReadonlySet<string>,
  consumedFiles: ReadonlySet<string> = new Set(),
  maxReferenceDepth?: number,
  maxSourceFileSizeBytes?: number,
): DiscoveredResources {
  const diagnostics: Diagnostic[] = [];
  const resources: Record<string, unknown> = {};
  const sourceMap = new Map<string, { file: string; line: number; column: number }>();

  const collectionDir = path.join(rootDir, collection);
  const seenKeys = new Set(existingKeys);

  for (const fileName of fs.listFiles(collectionDir)) {
    const ext = AUTO_DISCOVER_EXTENSIONS.find((candidate) => fileName.endsWith(candidate));
    if (!ext) {
      continue;
    }

    const key = fileName.slice(0, -ext.length);
    const relativePath = path.join(collection, fileName);

    if (consumedFiles.has(relativePath)) {
      continue;
    }

    if (seenKeys.has(key)) {
      diagnostics.push({
        code: PARSER_DIAGNOSTIC_CODES.DUPLICATE_RESOURCE.code,
        severity: 'error',
        message: `Resource "${key}" is declared both explicitly and via auto-discovered file "${relativePath}"`,
        path: [collection, key],
      });
      continue;
    }
    seenKeys.add(key);

    const doc = loadDocument(fs.readFile(path.join(rootDir, relativePath)), relativePath, {
      maxSourceFileSizeBytes,
    });
    diagnostics.push(...doc.diagnostics);

    // An auto-discovered file can itself contain $ref/file/schemaRef
    // markers (e.g. an auto-discovered agent's instructions.file) — route
    // it through the same resolver `$ref` targets use, with `relativePath`
    // as the base every marker inside it resolves against.
    const resolved = doc.diagnostics.some((d) => d.severity === 'error')
      ? { value: doc.value, sourceMap: doc.sourceMap, diagnostics: [] as Diagnostic[] }
      : resolveReferences(doc.value, relativePath, doc.sourceMap, {
          rootDir,
          fs,
          maxDepth: maxReferenceDepth,
          maxSourceFileSizeBytes,
        });
    diagnostics.push(...resolved.diagnostics);
    resources[key] = resolved.value;

    const prefix = pathToKey([collection, key]);
    sourceMap.set(prefix, { file: relativePath, line: 1, column: 1 });
    for (const [innerKey, location] of resolved.sourceMap) {
      sourceMap.set(`${prefix}.${innerKey}`, location);
    }
  }

  return { resources, sourceMap, diagnostics };
}
