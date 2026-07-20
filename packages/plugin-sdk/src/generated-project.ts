export interface GeneratedFile {
  /** Relative to the generated project's own root (e.g. `src/agents/intake.ts`), never an absolute path — writing it to disk is the CLI's job, not this package's. */
  readonly path: string;
  readonly content: string;
  /** Which IR resource(s) this file was generated from (§22 "Include source mappings") — e.g. `["agent.intake"]`. */
  readonly sourceResourceAddresses?: readonly string[];
}

/**
 * Matches §22's manifest example exactly. `generatedAt` is always `null`
 * in the artifact itself — §22: "for reproducibility, avoid timestamps
 * inside deterministic generated artifacts; a timestamp may be stored
 * separately in apply metadata." Keeping the field (rather than omitting
 * it) documents that this is a deliberate, fixed value, not a forgotten
 * one.
 */
export interface GeneratedManifest {
  readonly generatedBy: 'agentform';
  readonly agentformVersion: string;
  readonly specVersion: string;
  readonly adapter: string;
  readonly adapterVersion: string;
  readonly sourceHash: string;
  readonly irHash: string;
  readonly generatedAt: null;
}

export interface GeneratedProject {
  readonly target: string;
  readonly files: readonly GeneratedFile[];
  readonly manifest: GeneratedManifest;
}
