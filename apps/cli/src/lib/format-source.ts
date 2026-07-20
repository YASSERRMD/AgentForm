import { parseDocument } from 'yaml';

/**
 * Deterministically reformats YAML or JSON source text — same input
 * always produces the same output, and formatting an already-formatted
 * file is a no-op (idempotent), matching §15.3's "Formatting must be
 * deterministic". JSON files stay JSON (parsed and re-serialized with
 * `JSON.stringify`, never rewritten into YAML syntax); YAML files are
 * re-serialized through the `yaml` package with fixed style options
 * (2-space indent, no automatic line-wrapping — wrapping would silently
 * fold long strings into YAML block scalars, which is surprising for a
 * formatter to do uninvited). Key order is preserved either way; this is
 * a style formatter, not a canonicalizer (that's `@agentform/ir`'s content
 * hash, a deliberately different concern — see docs/adr/0005).
 */
export function formatSourceText(text: string, fileName: string): string {
  if (fileName.endsWith('.json')) {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  }

  const doc = parseDocument(text, { uniqueKeys: true });
  return doc.toString({ indent: 2, lineWidth: 0 });
}
