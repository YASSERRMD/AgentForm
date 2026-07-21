import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.venv',
  'venv',
  '__pycache__',
  '.turbo',
  '.mypy_cache',
  '.pytest_cache',
]);

export interface SourceFile {
  /** Relative to `rootDir`, forward-slash separated regardless of platform. */
  readonly path: string;
  readonly content: string;
}

export interface WalkSourceFilesOptions {
  readonly extensions: readonly string[];
  readonly maxFiles?: number;
  readonly maxFileSizeBytes?: number;
  readonly excludedDirs?: ReadonlySet<string>;
}

/**
 * Recursively reads every text file under `rootDir` whose name ends with
 * one of `extensions`, for heuristic source scanning (e.g. `agentform
 * import`'s raw-project recognizers). Deliberately not a general-purpose
 * file walker: it skips dependency/build/VCS directories and any other
 * dotfile-style directory, and stops once `maxFiles` (default 500) have
 * been collected — a best-effort scan over a bounded slice of the tree,
 * not an exhaustive index of an arbitrarily large project. A directory
 * this process can't read is skipped rather than failing the whole walk.
 */
export function walkSourceFiles(
  rootDir: string,
  options: WalkSourceFilesOptions,
): readonly SourceFile[] {
  const excluded = options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS;
  const maxFiles = options.maxFiles ?? 500;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 1_000_000;
  const results: SourceFile[] = [];

  function walk(dir: string): void {
    if (results.length >= maxFiles) {
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (!entry.isFile() || !options.extensions.some((ext) => entry.name.endsWith(ext))) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      let size: number;
      try {
        size = statSync(fullPath).size;
      } catch {
        continue;
      }
      if (size > maxFileSizeBytes) {
        continue;
      }
      results.push({
        path: path.relative(rootDir, fullPath).split(path.sep).join('/'),
        content: readFileSync(fullPath, 'utf-8'),
      });
    }
  }

  walk(rootDir);
  return results;
}
