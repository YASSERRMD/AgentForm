import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';
import type { Diagnostic, SourceLocation } from '@agentform/diagnostics';
import { PARSER_DIAGNOSTIC_CODES } from './codes.js';
import { pathToKey, type ParsedDocument, type ResourcePath } from './types.js';

/**
 * The `yaml` package's CST node types aren't fully precise about which
 * nodes carry a `range` (scalars, maps, and sequences all do; aliases and
 * some synthetic nodes may not) — this walk treats `range` as optional and
 * simply skips a source-map entry when it's absent, rather than fighting
 * the library's types with unsafe casts. This file is the one place in the
 * package that touches the raw CST; everything downstream works with the
 * plain `SourceMap`/`unknown` value pair from `ParsedDocument`.
 */
interface RangedNode {
  readonly range?: readonly [number, number, number] | null;
}

function recordLocation(
  sourceMap: Map<string, SourceLocation>,
  path: ResourcePath,
  node: RangedNode | null | undefined,
  file: string,
  lineCounter: LineCounter,
): void {
  const range = node?.range;
  if (!range) {
    return;
  }
  const pos = lineCounter.linePos(range[0]);
  sourceMap.set(pathToKey(path), { file, line: pos.line, column: pos.col });
}

function walk(
  node: unknown,
  currentPath: ResourcePath,
  file: string,
  lineCounter: LineCounter,
  sourceMap: Map<string, SourceLocation>,
): void {
  if (isMap(node)) {
    for (const pair of node.items) {
      const keyValue =
        isMap(pair.key) || isSeq(pair.key) ? undefined : (pair.key as { value?: unknown })?.value;
      const key = String(keyValue ?? pair.key);
      const childPath = [...currentPath, key];
      recordLocation(sourceMap, childPath, pair.key as RangedNode, file, lineCounter);
      walk(pair.value, childPath, file, lineCounter, sourceMap);
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item, index) => {
      const childPath = [...currentPath, index];
      recordLocation(sourceMap, childPath, item as RangedNode, file, lineCounter);
      walk(item, childPath, file, lineCounter, sourceMap);
    });
  }
}

/** Default cap on a single source file's size (§19 "Maximum source file size"), chosen generously above any realistic hand-written Agentform document while still bounding how much text a single file can force the YAML parser to walk. */
export const DEFAULT_MAX_SOURCE_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export interface LoadDocumentOptions {
  readonly maxSourceFileSizeBytes?: number;
}

/**
 * Parses YAML *or* JSON text (JSON is valid YAML, so one parser covers
 * both source formats — see ADR-0004) into a plain JS value, a
 * field-path → source-location map, and any syntax diagnostics. Never
 * throws on malformed input; syntax errors come back as diagnostics.
 *
 * Checks `text`'s byte size against `maxSourceFileSizeBytes` *before*
 * handing it to the YAML parser (§19 "Maximum source file size") — an
 * oversized file is rejected as a diagnostic instead of being parsed at
 * all, since parsing itself is the expensive step a hostile file would be
 * trying to force.
 */
export function loadDocument(
  text: string,
  file: string,
  options: LoadDocumentOptions = {},
): ParsedDocument {
  const maxSize = options.maxSourceFileSizeBytes ?? DEFAULT_MAX_SOURCE_FILE_SIZE_BYTES;
  const sizeBytes = Buffer.byteLength(text, 'utf-8');
  if (sizeBytes > maxSize) {
    return {
      value: undefined,
      sourceMap: new Map(),
      diagnostics: [
        {
          code: PARSER_DIAGNOSTIC_CODES.MAX_SOURCE_FILE_SIZE_EXCEEDED.code,
          severity: 'error',
          message: `File "${file}" is ${sizeBytes} bytes, exceeding the maximum allowed size of ${maxSize} bytes`,
        },
      ],
    };
  }

  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true });

  const diagnostics: Diagnostic[] = [...doc.errors, ...doc.warnings].map((error) => {
    const pos = error.pos ? lineCounter.linePos(error.pos[0]) : undefined;
    return {
      code: PARSER_DIAGNOSTIC_CODES.SYNTAX_ERROR.code,
      severity: error.name === 'YAMLWarning' ? 'warning' : 'error',
      message: error.message,
      location: pos ? { file, line: pos.line, column: pos.col } : undefined,
    };
  });

  const sourceMap = new Map<string, SourceLocation>();
  if (doc.contents) {
    walk(doc.contents, [], file, lineCounter, sourceMap);
  }

  const value = diagnostics.some((d) => d.severity === 'error') ? undefined : doc.toJS();

  return { value, sourceMap, diagnostics };
}
