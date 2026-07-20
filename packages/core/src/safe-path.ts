import path from 'node:path';

export class UnsafePathError extends Error {
  readonly requestedPath: string;
  readonly root: string;

  constructor(requestedPath: string, root: string) {
    super(`Path "${requestedPath}" resolves outside the project root "${root}"`);
    this.name = 'UnsafePathError';
    this.requestedPath = requestedPath;
    this.root = root;
  }
}

function assertWithinRoot(resolvedRoot: string, resolved: string, requestedPath: string): string {
  const relativeFromRoot = path.relative(resolvedRoot, resolved);
  const escapesRoot =
    relativeFromRoot === '..' ||
    relativeFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeFromRoot);

  if (escapesRoot) {
    throw new UnsafePathError(requestedPath, resolvedRoot);
  }

  return resolved;
}

/**
 * Resolves `relativePath` against `root` and rejects the result unless it
 * stays within `root` — the project-root filesystem sandbox required by
 * §19/§30 ("File access confined to project root by default", "Safe path
 * normalization"). Rejects absolute paths, `..` traversal that escapes
 * `root`, and (on Windows) drive-letter changes, since all of those are
 * ways a `$ref`, prompt file, or schema reference could otherwise reach
 * outside the project.
 *
 * Both `root` and the returned path are normalized+resolved absolute
 * paths, so callers can compare/nest them with plain string operations.
 */
export function resolvePathWithinRoot(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new UnsafePathError(relativePath, root);
  }

  const resolvedRoot = path.resolve(root);
  return assertWithinRoot(resolvedRoot, path.resolve(resolvedRoot, relativePath), relativePath);
}

/**
 * Resolves `relativePath` against the *directory containing* `fromFile`
 * (not against `root` directly) — the semantics a `$ref` inside an
 * already-loaded file needs, since `$ref: ../tools/search.yaml` is
 * relative to wherever that file itself lives, not the project root.
 * Still rejects the result unless it stays within `root`, exactly like
 * {@link resolvePathWithinRoot}, so a chain of relative references can
 * never walk its way outside the project regardless of nesting depth.
 */
export function resolvePathRelativeToFile(
  root: string,
  fromFile: string,
  relativePath: string,
): string {
  if (path.isAbsolute(relativePath)) {
    throw new UnsafePathError(relativePath, root);
  }

  const resolvedRoot = path.resolve(root);
  const fromDir = path.dirname(path.resolve(resolvedRoot, fromFile));
  return assertWithinRoot(resolvedRoot, path.resolve(fromDir, relativePath), relativePath);
}
