import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePathRelativeToFile, resolvePathWithinRoot, UnsafePathError } from './safe-path.js';

const root = path.resolve('/tmp/agentform-fixture-root');

describe('resolvePathWithinRoot', () => {
  it('resolves a simple relative path within the root', () => {
    expect(resolvePathWithinRoot(root, 'agents/researcher.yaml')).toBe(
      path.join(root, 'agents/researcher.yaml'),
    );
  });

  it('resolves a same-directory reference', () => {
    expect(resolvePathWithinRoot(root, './agentform.yaml')).toBe(path.join(root, 'agentform.yaml'));
  });

  it('allows internal ".." segments that still resolve inside the root', () => {
    expect(resolvePathWithinRoot(root, 'agents/../tools/search.yaml')).toBe(
      path.join(root, 'tools/search.yaml'),
    );
  });

  it('rejects ".." traversal that escapes the root', () => {
    expect(() => resolvePathWithinRoot(root, '../../etc/passwd')).toThrow(UnsafePathError);
  });

  it('rejects a path that escapes the root by exactly one level', () => {
    expect(() => resolvePathWithinRoot(root, '../sibling-project/agentform.yaml')).toThrow(
      UnsafePathError,
    );
  });

  it('rejects an absolute path even if it happens to point inside the root', () => {
    expect(() => resolvePathWithinRoot(root, path.join(root, 'agentform.yaml'))).toThrow(
      UnsafePathError,
    );
  });

  it('includes the offending path and root in the error', () => {
    try {
      resolvePathWithinRoot(root, '../outside.yaml');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafePathError);
      expect((error as UnsafePathError).requestedPath).toBe('../outside.yaml');
      expect((error as UnsafePathError).root).toBe(root);
    }
  });
});

describe('resolvePathRelativeToFile', () => {
  it('resolves relative to the directory containing the referencing file, not the root', () => {
    expect(resolvePathRelativeToFile(root, 'agents/researcher.yaml', '../tools/search.yaml')).toBe(
      path.join(root, 'tools/search.yaml'),
    );
  });

  it('resolves a nested reference from a deeply nested file', () => {
    expect(resolvePathRelativeToFile(root, 'a/b/c/deep.yaml', './sibling.yaml')).toBe(
      path.join(root, 'a/b/c/sibling.yaml'),
    );
  });

  it('still rejects a chain that ultimately escapes the root', () => {
    expect(() =>
      resolvePathRelativeToFile(root, 'agents/researcher.yaml', '../../../etc/passwd'),
    ).toThrow(UnsafePathError);
  });

  it('rejects an absolute relativePath', () => {
    expect(() => resolvePathRelativeToFile(root, 'agents/researcher.yaml', '/etc/passwd')).toThrow(
      UnsafePathError,
    );
  });
});
