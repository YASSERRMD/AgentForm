import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkSourceFiles } from './walk-source-files.js';

function tempProject(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentform-core-walk-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
  return dir;
}

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('walkSourceFiles', () => {
  it('reads every matching file recursively, with rootDir-relative forward-slash paths', () => {
    dir = tempProject({
      'main.py': 'print("hi")',
      'agents/triage.py': 'x = 1',
      'agents/nested/deep.py': 'y = 2',
    });
    const files = walkSourceFiles(dir, { extensions: ['.py'] });
    expect(files.map((f) => f.path).sort()).toEqual([
      'agents/nested/deep.py',
      'agents/triage.py',
      'main.py',
    ]);
  });

  it('filters by extension', () => {
    dir = tempProject({ 'a.py': 'a', 'b.ts': 'b', 'c.md': 'c' });
    const files = walkSourceFiles(dir, { extensions: ['.py', '.ts'] });
    expect(files.map((f) => f.path).sort()).toEqual(['a.py', 'b.ts']);
  });

  it('skips well-known dependency/build/VCS directories', () => {
    dir = tempProject({
      'real.py': 'real',
      'node_modules/pkg/index.py': 'nope',
      '.git/hooks/pre-commit.py': 'nope',
      '__pycache__/cache.py': 'nope',
      'dist/out.py': 'nope',
    });
    const files = walkSourceFiles(dir, { extensions: ['.py'] });
    expect(files.map((f) => f.path)).toEqual(['real.py']);
  });

  it('returns file content verbatim', () => {
    dir = tempProject({ 'a.py': 'hello world' });
    const [file] = walkSourceFiles(dir, { extensions: ['.py'] });
    expect(file?.content).toBe('hello world');
  });

  it('stops once maxFiles is reached', () => {
    dir = tempProject({ 'a.py': '1', 'b.py': '2', 'c.py': '3' });
    const files = walkSourceFiles(dir, { extensions: ['.py'], maxFiles: 2 });
    expect(files).toHaveLength(2);
  });

  it('skips files larger than maxFileSizeBytes', () => {
    dir = tempProject({ 'small.py': 'x', 'big.py': 'y'.repeat(100) });
    const files = walkSourceFiles(dir, { extensions: ['.py'], maxFileSizeBytes: 10 });
    expect(files.map((f) => f.path)).toEqual(['small.py']);
  });

  it('returns an empty list for a directory with no matching files', () => {
    dir = tempProject({ 'readme.md': 'nothing to see' });
    expect(walkSourceFiles(dir, { extensions: ['.py'] })).toEqual([]);
  });
});
