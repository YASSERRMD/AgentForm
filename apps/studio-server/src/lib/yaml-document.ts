import type { SpecPatch } from '@agentform/studio-core';
import { parseDocument, type Document } from 'yaml';

/**
 * Applies a `SpecPatch` directly onto a parsed `yaml.Document` — not the
 * plain JS value `@agentform/parser` returns. `Document#setIn`/`deleteIn`
 * mutate only the targeted node; everything else (comments, key order,
 * blank lines, quoting style) survives untouched, verified empirically
 * against the real installed `yaml` package before this was written.
 * This is the "lossless round trip" Phase 14 requires — re-serializing
 * from a plain object (the way `@agentform/core`'s `format` command
 * does for whole-file reformatting) would destroy exactly the things
 * this needs to preserve.
 */
export function applyPatchToDocument(doc: Document, patch: SpecPatch): void {
  for (const operation of patch) {
    if (operation.op === 'remove') {
      doc.deleteIn(operation.path);
    } else {
      doc.setIn(operation.path, operation.value);
    }
  }
}

export function parseYamlDocument(text: string): Document {
  return parseDocument(text, { uniqueKeys: true });
}

export function stringifyYamlDocument(doc: Document): string {
  return doc.toString({ indent: 2, lineWidth: 0 });
}
