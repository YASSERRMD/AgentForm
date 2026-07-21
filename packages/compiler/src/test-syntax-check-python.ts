import { execFileSync } from 'node:child_process';

/**
 * True when `source` parses as syntactically valid Python — the Python
 * counterpart to `@agentform/adapter-openai`'s
 * `isSyntacticallyValidTypeScript`, used the same way by every
 * Python-targeting adapter's tests to prove the strings they build are real
 * code, not just plausible-looking text. Shells out to the real `python3`
 * interpreter's own `ast.parse` (GitHub Actions' `ubuntu-latest` runners
 * ship Python 3 preinstalled, and it's present on this project's dev
 * machines) rather than reimplementing a Python parser. Deliberately
 * syntax-only — no import resolution against any adapter's real target
 * package, which would need it installed here; a real install-and-import
 * check against the actual SDK was verified separately per adapter (see
 * `docs/compiler-reference.md`'s Scope section).
 */
export function isSyntacticallyValidPython(source: string): boolean {
  try {
    execFileSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], {
      input: source,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
