import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @agentform/parser's `FileSystem` is deliberately read-only (the parser
 * never writes a spec) — this is studio-server's own minimal write
 * abstraction for the two places Studio persists a file: the spec-patch
 * write path (Phase 14) and the design-artifact write path (Phase 16).
 */
export interface FileWriter {
  readonly writeFile: (absolutePath: string, content: string) => void;
}

/**
 * The spec-patch path only ever writes to an entry file that's already
 * known to exist (discoverEntryFile requires it), so its parent directory
 * always exists too — this `mkdirSync` only actually does anything for
 * the design-artifact path, where `design/` may not exist yet on a
 * project that's never had a layout saved before. Found via real browser
 * verification: `writeFileSync` alone doesn't create parent directories,
 * and every unit test for this used an in-memory FileWriter double that
 * doesn't care whether a "directory" exists — only a real filesystem
 * write against a fresh scratch project surfaced this.
 */
export const nodeFileWriter: FileWriter = {
  writeFile: (absolutePath, content) => {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
  },
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
