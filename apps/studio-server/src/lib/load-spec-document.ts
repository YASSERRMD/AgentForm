import { loadProject, nodeFileSystem, type FileSystem } from '@agentform/parser';
import { buildSpecDocument, type SpecDocumentResponse } from '@agentform/studio-core';

export interface LoadSpecDocumentOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  readonly environment?: string;
}

/**
 * Studio's equivalent of the CLI's `loadAndBuildIR`
 * (apps/cli/src/lib/pipeline.ts): composes @agentform/parser's
 * loadProject (I/O, injectable FileSystem — real disk by default,
 * an in-memory fixture in tests) with studio-core's buildSpecDocument
 * (pure) into the one snapshot `GET /api/spec` returns. Deliberately
 * skips @agentform/registry module resolution — no existing example
 * project uses `spec.modules`, so there's nothing to exercise it
 * against yet; add it here the moment that changes.
 */
export function loadSpecDocument(options: LoadSpecDocumentOptions): SpecDocumentResponse {
  const project = loadProject({
    rootDir: options.rootDir,
    fs: options.fs ?? nodeFileSystem,
    environment: options.environment,
  });

  if (project.diagnostics.some((d) => d.severity === 'error')) {
    return { diagnostics: project.diagnostics };
  }

  const document = buildSpecDocument(project.value, { sourceMap: project.sourceMap });
  return {
    application: document.application,
    diagnostics: [...project.diagnostics, ...document.diagnostics],
  };
}
