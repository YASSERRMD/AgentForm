import { nodeFileSystem, type FileSystem } from '@agentform/parser';
import {
  validateDesignArtifact,
  type ChangeSource,
  type DesignDraft,
  type PutDesignResponse,
} from '@agentform/studio-design';
import { stampDesignArtifact } from '@agentform/studio-design/server';
import type { Diagnostic } from '@agentform/diagnostics';
import { appendAuditEntry } from './audit-log.js';
import { nodeFileWriter, type FileWriter } from './file-writer.js';
import { loadSpecDocument } from './load-spec-document.js';
import { writeDesignFile } from './design-fs.js';

export interface ApplyDesignPatchOptions {
  readonly rootDir: string;
  readonly draft: DesignDraft;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
  /** Where this draft actually came from — recorded in the local audit log (Phase 18). Defaults to `'manual'` when omitted. */
  readonly provenance?: { readonly source: ChangeSource; readonly summary?: string };
}

function rejected(diagnostics: readonly Diagnostic[]): PutDesignResponse {
  return { success: false, diagnostics };
}

/**
 * The design-artifact write path. Never trusts a client-submitted draft:
 * loads the current spec fresh, stamps the draft into a full artifact
 * (server-computed designVersion/specVersionTarget/contentHash — see
 * @agentform/studio-design's server.ts), then validates the *stamped*
 * result against that same spec before anything touches disk. A design
 * write never re-runs schema/semantic/IR/policy validation the way
 * apply-spec-patch.ts does — design artifacts aren't spec resources, they
 * only need referential integrity against the resources they bind to.
 */
export function applyDesignPatch(options: ApplyDesignPatchOptions): PutDesignResponse {
  const fs = options.fs ?? nodeFileSystem;
  const fileWriter = options.fileWriter ?? nodeFileWriter;

  const specDocument = loadSpecDocument({ rootDir: options.rootDir, fs });
  if (!specDocument.application) {
    return rejected(specDocument.diagnostics);
  }

  const stamped = stampDesignArtifact(options.draft, specDocument.application);
  const diagnostics = validateDesignArtifact(stamped, specDocument.application);
  if (diagnostics.some((d) => d.severity === 'error')) {
    return rejected(diagnostics);
  }

  writeDesignFile(options.rootDir, fileWriter, stamped);

  appendAuditEntry(options.rootDir, fs, fileWriter, {
    source: options.provenance?.source ?? 'manual',
    summary:
      options.provenance?.summary ??
      `Updated layout for ${stamped.binding.resourceType}.${stamped.binding.resourceId}`,
    target: {
      kind: 'design',
      resourceType: stamped.binding.resourceType,
      resourceId: stamped.binding.resourceId,
    },
  });

  return { success: true, design: stamped, diagnostics };
}
