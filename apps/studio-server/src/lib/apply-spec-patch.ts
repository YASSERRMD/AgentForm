import path from 'node:path';
import { discoverEntryFile, loadProject, nodeFileSystem, type FileSystem } from '@agentform/parser';
import {
  BUILTIN_POLICIES,
  evaluatePolicies,
  loadPolicyConfig,
  policyResultsToDiagnostics,
} from '@agentform/policy';
import {
  applyPatch,
  buildSpecDocument,
  type PatchSpecResponse,
  type SpecPatch,
} from '@agentform/studio-core';
import type { Diagnostic } from '@agentform/diagnostics';
import { STUDIO_DIAGNOSTIC_CODES } from './codes.js';
import { nodeFileWriter, type FileWriter } from './file-writer.js';
import { applyPatchToDocument, parseYamlDocument, stringifyYamlDocument } from './yaml-document.js';

export interface ApplySpecPatchOptions {
  readonly rootDir: string;
  readonly patch: SpecPatch;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
}

function rejected(diagnostics: readonly Diagnostic[]): PatchSpecResponse {
  return { success: false, diagnostics };
}

/**
 * The one write path in Studio (Phase 14). Never trusts the incoming
 * patch as pre-validated: re-reads the project fresh from disk, applies
 * the patch to a plain in-memory value, and re-runs the *entire*
 * schema -> semantic/IR -> policy pipeline before anything touches disk
 * — exactly the design intent recorded in ADR-0016 / the "Studio local
 * server exposure" threat model entry. Only a single-file project (no
 * $ref, no auto-discovered agents/tools/workflows directories) can be
 * written back today: round-trip-safe patching targets the one real
 * `yaml.Document` parsed from that file's own text (see
 * lib/yaml-document.ts) — there's no defined behavior yet for "this
 * field actually lives in a different file", so that case is refused
 * with an honest diagnostic rather than guessed at.
 */
export function applySpecPatch(options: ApplySpecPatchOptions): PatchSpecResponse {
  const fs = options.fs ?? nodeFileSystem;
  const fileWriter = options.fileWriter ?? nodeFileWriter;

  const entry = discoverEntryFile(options.rootDir, fs);
  if (!entry.file) {
    return rejected(entry.diagnostics);
  }

  const project = loadProject({ rootDir: options.rootDir, fs });
  if (project.diagnostics.some((d) => d.severity === 'error')) {
    return rejected(project.diagnostics);
  }

  const referencedFiles = new Set([...project.sourceMap.values()].map((location) => location.file));
  referencedFiles.add(entry.file);
  if (referencedFiles.size > 1) {
    return rejected([
      {
        code: STUDIO_DIAGNOSTIC_CODES.MULTI_FILE_PROJECT_NOT_WRITABLE.code,
        severity: 'error',
        message: `This project spans multiple files (${[...referencedFiles].sort().join(', ')}) — editing multi-file projects through Studio isn't supported yet. Edit the source files directly.`,
      },
    ]);
  }

  const patchedValue = applyPatch(project.value, options.patch);
  const document = buildSpecDocument(patchedValue, { sourceMap: project.sourceMap });
  if (document.diagnostics.some((d) => d.severity === 'error') || !document.application) {
    return rejected(document.diagnostics);
  }

  const policyConfig = loadPolicyConfig(options.rootDir);
  if (policyConfig.diagnostics.some((d) => d.severity === 'error')) {
    return rejected(policyConfig.diagnostics);
  }
  const policyEvaluation = evaluatePolicies(
    BUILTIN_POLICIES,
    { application: document.application },
    policyConfig.config,
  );
  const policyDiagnostics = [
    ...policyEvaluation.diagnostics,
    ...policyResultsToDiagnostics(policyEvaluation.results),
  ];
  if (policyDiagnostics.some((d) => d.severity === 'error')) {
    return rejected([...document.diagnostics, ...policyDiagnostics]);
  }

  const absoluteEntryPath = path.join(options.rootDir, entry.file);
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
    diagnostics: [...document.diagnostics, ...policyDiagnostics],
  };
}
