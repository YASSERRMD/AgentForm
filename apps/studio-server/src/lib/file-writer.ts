import { writeFileSync } from 'node:fs';

/**
 * @agentform/parser's `FileSystem` is deliberately read-only (the parser
 * never writes a spec) — this is studio-server's own minimal write
 * abstraction, only for the one place Studio actually persists a file:
 * the patch write path (Phase 14).
 */
export interface FileWriter {
  readonly writeFile: (absolutePath: string, content: string) => void;
}

export const nodeFileWriter: FileWriter = {
  writeFile: (absolutePath, content) => writeFileSync(absolutePath, content, 'utf-8'),
};

/** For tests: captures writes in memory instead of touching real disk. */
export function createInMemoryFileWriter(): FileWriter & { readonly written: Map<string, string> } {
  const written = new Map<string, string>();
  return {
    written,
    writeFile: (absolutePath, content) => {
      written.set(absolutePath, content);
    },
  };
}
