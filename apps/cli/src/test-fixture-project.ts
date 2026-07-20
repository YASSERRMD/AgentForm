import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

export interface FixtureProject {
  readonly dir: string;
  readonly cleanup: () => void;
}

/** Materializes `files` (relative path → content) as a real temp directory — the CLI's `nodeFileSystem` reads real files, so command e2e tests need a real project on disk, not the parser package's in-memory fixture pattern. */
export function createFixtureProject(files: Readonly<Record<string, string>>): FixtureProject {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentform-cli-test-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Spawns the *built* CLI binary (requires `pnpm build` to have run first) against `fixtureDir` via `--cwd`, capturing output and exit code without throwing on a non-zero exit. */
export function runCli(args: readonly string[], fixtureDir: string): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [cliEntry, ...args, '--cwd', fixtureDir], {
      encoding: 'utf-8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error) {
    const spawnError = error as { stdout?: string; stderr?: string; status?: number | null };
    return {
      stdout: spawnError.stdout ?? '',
      stderr: spawnError.stderr ?? '',
      exitCode: spawnError.status ?? 1,
    };
  }
}
