import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Filesystem access is injected everywhere in this package (§30 "Make
 * filesystem operations testable") so reference/overlay/prompt resolution
 * can be unit tested against an in-memory project tree instead of real
 * temp directories.
 */
export interface FileSystem {
  readonly readFile: (absolutePath: string) => string;
  readonly exists: (absolutePath: string) => boolean;
  /** Top-level file basenames in `absoluteDir`, or `[]` if it doesn't exist. Never recurses. */
  readonly listFiles: (absoluteDir: string) => readonly string[];
}

export const nodeFileSystem: FileSystem = {
  readFile: (absolutePath) => readFileSync(absolutePath, 'utf-8'),
  exists: (absolutePath) => existsSync(absolutePath),
  listFiles: (absoluteDir) =>
    existsSync(absoluteDir)
      ? readdirSync(absoluteDir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
      : [],
};

/** Keys are absolute paths, matching what callers pass to `readFile`/`exists`/`listFiles`. */
export function createInMemoryFileSystem(files: Readonly<Record<string, string>>): FileSystem {
  return {
    readFile: (absolutePath) => {
      const contents = files[absolutePath];
      if (contents === undefined) {
        throw new Error(`ENOENT: no such file: ${absolutePath}`);
      }
      return contents;
    },
    exists: (absolutePath) => absolutePath in files,
    listFiles: (absoluteDir) => {
      const prefix = absoluteDir.endsWith(path.sep) ? absoluteDir : `${absoluteDir}${path.sep}`;
      const names = new Set<string>();
      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const rest = filePath.slice(prefix.length);
        if (!rest.includes(path.sep)) {
          names.add(rest);
        }
      }
      return [...names].sort();
    },
  };
}
