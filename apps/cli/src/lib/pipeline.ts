import type { Diagnostic } from '@agentform/diagnostics';
import { type AgentformIR, buildIR } from '@agentform/ir';
import { loadProject, nodeFileSystem } from '@agentform/parser';
import type { AgenticApplication } from '@agentform/schema';

export interface LoadAndBuildOptions {
  readonly rootDir: string;
  readonly environment?: string;
}

export interface LoadAndBuildResult {
  readonly ir?: AgentformIR;
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The shared `loadProject → buildIR` pipeline every diagnostics-producing
 * command (`validate`, `inspect`, `graph`) runs. Stops after parsing if
 * parsing itself failed — schema/semantic validation over a document that
 * didn't even parse would just produce confusing secondary diagnostics.
 */
export function loadAndBuildIR(options: LoadAndBuildOptions): LoadAndBuildResult {
  const project = loadProject({
    rootDir: options.rootDir,
    fs: nodeFileSystem,
    environment: options.environment,
  });

  if (project.diagnostics.some((d) => d.severity === 'error')) {
    return { diagnostics: project.diagnostics };
  }

  const irResult = buildIR(project.value, { sourceMap: project.sourceMap });
  return {
    ir: irResult.ir,
    application: irResult.application,
    diagnostics: [...project.diagnostics, ...irResult.diagnostics],
  };
}
