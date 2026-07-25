import path from 'node:path';
import { loadProject, nodeFileSystem, type FileSystem } from '@agentform/parser';
import type { PatchSpecResponse, SpecPatch } from '@agentform/studio-core';
import { buildSpecDocument } from '@agentform/studio-core/server';
import { nodeFileWriter, type FileWriter } from './file-writer.js';
import { applyPatchToDocument, parseYamlDocument, stringifyYamlDocument } from './yaml-document.js';
import { validateSpecPatch } from './validate-spec-patch.js';

export interface ApplySpecPatchOptions {
  readonly rootDir: string;
  readonly patch: SpecPatch;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
}

/**
 * The one write path in Studio (Phase 14). Runs the patch through
 * `validateSpecPatch` first — never trusts the incoming patch as
 * pre-validated — and only then touches disk, exactly the design intent
 * recorded in ADR-0016 / the "Studio local server exposure" threat model
 * entry. Only a single-file project (no $ref, no auto-discovered
 * agents/tools/workflows directories) can be written back today:
 * round-trip-safe patching targets the one real `yaml.Document` parsed
 * from that file's own text (see lib/yaml-document.ts) — there's no
 * defined behavior yet for "this field actually lives in a different
 * file", so that case is refused with an honest diagnostic rather than
 * guessed at (enforced by `validateSpecPatch` itself).
 */
export function applySpecPatch(options: ApplySpecPatchOptions): PatchSpecResponse {
  const fs = options.fs ?? nodeFileSystem;
  const fileWriter = options.fileWriter ?? nodeFileWriter;

  const validation = validateSpecPatch({ rootDir: options.rootDir, patch: options.patch, fs });
  if (!validation.success) {
    return { success: false, diagnostics: validation.diagnostics };
  }

  const absoluteEntryPath = path.join(options.rootDir, validation.entryFile);
  const yamlDoc = parseYamlDocument(fs.readFile(absoluteEntryPath));
  applyPatchToDocument(yamlDoc, options.patch);
  fileWriter.writeFile(absoluteEntryPath, stringifyYamlDocument(yamlDoc));

  // Re-read from disk rather than trusting the in-memory result — the
  // response reflects what's actually on disk now, not what this
  // process computed a moment ago, the same discipline GET /api/spec
  // already follows.
  const reread = loadProject({ rootDir: options.rootDir, fs });
  const rereadDocument = buildSpecDocument(reread.value, { sourceMap: reread.sourceMap });
  return {
    success: true,
    application: rereadDocument.application,
    diagnostics: validation.diagnostics,
  };
}
