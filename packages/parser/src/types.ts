import type { Diagnostic, SourceLocation } from '@agentform/diagnostics';

export type ResourcePath = readonly (string | number)[];

/** Maps a dot-joined field path (e.g. `"spec.agents.intake.model"`) to where it was declared in source. */
export type SourceMap = ReadonlyMap<string, SourceLocation>;

export interface ParsedDocument {
  readonly value: unknown;
  readonly sourceMap: SourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

export function pathToKey(path: ResourcePath): string {
  return path.join('.');
}
