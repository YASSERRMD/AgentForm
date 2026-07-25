import type { FileSystem } from '@agentform/parser';
import {
  validateDesignArtifact,
  type DesignDraft,
  type PutDesignResponse,
} from '@agentform/studio-design';
import { stampDesignArtifact } from '@agentform/studio-design/server';
import type { Diagnostic } from '@agentform/diagnostics';
import { nodeFileWriter, type FileWriter } from './file-writer.js';
import { loadSpecDocument } from './load-spec-document.js';
import { writeDesignFile } from './design-fs.js';

export interface ApplyDesignPatchOptions {
  readonly rootDir: string;
  readonly draft: DesignDraft;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
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
  const fs = options.fs;
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

  return { success: true, design: stamped, diagnostics };
}
