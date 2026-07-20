import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

/**
 * True when `source` parses as syntactically valid TypeScript — used by
 * every generator's tests to prove the strings they build are real code,
 * not just plausible-looking text. Uses only `typescript`'s public
 * `createProgram`/`getSyntacticDiagnostics` API against a real (temp)
 * file, rather than reaching into `SourceFile`'s undocumented internals.
 * Deliberately syntax-only — no type checking against the real
 * `@openai/agents`/`zod` packages, which would need them installed here;
 * full compilation against the real SDK is verified separately (see
 * `docs/compiler-reference.md`'s Scope section).
 */
export function isSyntacticallyValidTypeScript(source: string): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentform-adapter-openai-syntax-'));
  const filePath = path.join(dir, 'generated.ts');
  try {
    writeFileSync(filePath, source, 'utf-8');
    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      noEmit: true,
    });
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return false;
    }
    return program.getSyntacticDiagnostics(sourceFile).length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
