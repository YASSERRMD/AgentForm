import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { autoGenAdapter } from '@agentform/adapter-autogen';
import { crewAiAdapter } from '@agentform/adapter-crewai';
import { googleAdkAdapter } from '@agentform/adapter-google-adk';
import { langGraphAdapter } from '@agentform/adapter-langgraph';
import { microsoftAdapter } from '@agentform/adapter-microsoft';
import { openAiAdapter } from '@agentform/adapter-openai';
import { compile as compileForTarget } from '@agentform/compiler';
import type { Diagnostic } from '@agentform/diagnostics';
import type { AgentformIR } from '@agentform/ir';
import type { FrameworkAdapter, GeneratedManifest, GeneratedProject } from '@agentform/plugin-sdk';

/** Every framework `@agentform/schema`'s `runtime.target` enum allows — all six now have a registered adapter (Phase 9 completed the last four). Shared by `agentform compile` and `agentform apply`: both write the exact same generated-project shape to disk, `apply` just does it as one step of a larger flow. */
export const ADAPTER_REGISTRY: Readonly<Record<string, FrameworkAdapter>> = {
  openai: openAiAdapter,
  langgraph: langGraphAdapter,
  microsoft: microsoftAdapter,
  'google-adk': googleAdkAdapter,
  autogen: autoGenAdapter,
  crewai: crewAiAdapter,
};

export interface GenerateArtifactsResult {
  readonly target: string;
  readonly outputDir: string;
  readonly filesWritten: number;
  readonly manifest?: GeneratedManifest;
  readonly diagnostics: readonly Diagnostic[];
  /** The full generated project (same as `manifest`, just not narrowed to only the manifest) — `agentform apply`'s "deploy" step needs this to hand to `adapter.deploy?.()`; `compile`'s own output doesn't need it beyond what's already written to disk. */
  readonly project?: GeneratedProject;
}

/** Compiles `ir` for `target` and writes the resulting project to `outputRoot/target/`, alongside a `manifest.json` (§22's exact shape — written once here, not by any adapter, since it's metadata about the generation rather than part of the generated application itself). `clean` removes that one target subdirectory first; nothing else is ever touched. */
export async function generateArtifacts(
  target: string,
  adapter: FrameworkAdapter,
  ir: AgentformIR,
  outputRoot: string,
  agentformVersion: string,
  clean: boolean,
): Promise<GenerateArtifactsResult> {
  const outputDir = path.resolve(outputRoot, target);
  if (clean && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  const result = await compileForTarget(ir, adapter, { outputDir, agentformVersion });

  if (!result.project) {
    return { target, outputDir, filesWritten: 0, diagnostics: result.diagnostics };
  }

  for (const file of result.project.files) {
    const filePath = path.join(outputDir, file.path);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
  writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(result.project.manifest, null, 2)}\n`,
    'utf-8',
  );

  return {
    target,
    outputDir,
    filesWritten: result.project.files.length,
    manifest: result.project.manifest,
    diagnostics: result.diagnostics,
    project: result.project,
  };
}
