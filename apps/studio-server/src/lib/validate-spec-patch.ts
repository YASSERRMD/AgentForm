import { discoverEntryFile, loadProject, nodeFileSystem, type FileSystem } from '@agentform/parser';
import {
  BUILTIN_POLICIES,
  evaluatePolicies,
  loadPolicyConfig,
  policyResultsToDiagnostics,
} from '@agentform/policy';
import { applyPatch, type AgenticApplication, type SpecPatch } from '@agentform/studio-core';
import { buildSpecDocument } from '@agentform/studio-core/server';
import type { Diagnostic } from '@agentform/diagnostics';
import { STUDIO_DIAGNOSTIC_CODES } from './codes.js';

export interface ValidateSpecPatchOptions {
  readonly rootDir: string;
  readonly patch: SpecPatch;
  readonly fs?: FileSystem;
}

export type ValidateSpecPatchResult =
  | { readonly success: false; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly success: true;
      readonly application: AgenticApplication;
      readonly diagnostics: readonly Diagnostic[];
      /** The single file the project resolved from — only meaningful to a caller that goes on to write, e.g. `applySpecPatch`. */
      readonly entryFile: string;
    };

function rejected(diagnostics: readonly Diagnostic[]): ValidateSpecPatchResult {
  return { success: false, diagnostics };
}

/**
 * The read-only half of Studio's one write path (§34's shared-pipeline
 * diagram): re-reads the project fresh from disk, applies the patch to a
 * plain in-memory value, and runs it through the entire
 * schema -> semantic/IR -> policy pipeline — everything `applySpecPatch`
 * (Phase 14) needs before it dares touch disk, and everything a GenAI
 * proposal preview (Phase 17) needs before it dares show a patch as
 * accepted. Extracted so both callers run the literal same checks in the
 * literal same order — a preview that approved something the write path
 * then refuses (or vice versa) would be worse than not previewing at all.
 *
 * Deliberately stops short of writing: no `FileWriter`, no YAML-document
 * round trip. That part only exists once, in `applySpecPatch`.
 */
export function validateSpecPatch(options: ValidateSpecPatchOptions): ValidateSpecPatchResult {
  const fs = options.fs ?? nodeFileSystem;

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

  return {
    success: true,
    application: document.application,
    diagnostics: [...document.diagnostics, ...policyDiagnostics],
    entryFile: entry.file,
  };
}
