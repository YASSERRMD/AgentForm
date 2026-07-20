import type { Diagnostic, SourceLocation } from '@agentform/diagnostics';
import { validateAgenticApplication } from '@agentform/schema';
import { computeContentHash } from './hash.js';
import { validateSemantics } from './semantic/index.js';
import type { AgentformIR, IRAgent, IRModel, IROutput, IRTool, IRWorkflow } from './types.js';

export const IR_VERSION = '0.1.0';
export const COMPILER_VERSION = '0.1.0';

export interface BuildIROptions {
  readonly sourceMap?: ReadonlyMap<string, SourceLocation>;
}

export interface BuildIRResult {
  readonly ir?: AgentformIR;
  readonly diagnostics: readonly Diagnostic[];
}

function normalizeModel(model: IRModel): IRModel {
  return { ...model, fallbacks: model.fallbacks ?? [], capabilities: model.capabilities ?? [] };
}

function normalizeTool(tool: IRTool): IRTool {
  return { ...tool, permissions: tool.permissions ?? [] };
}

function normalizeAgent(agent: IRAgent): IRAgent {
  return { ...agent, tools: agent.tools ?? [], policies: agent.policies ?? [] };
}

function normalizeOutput(output: IROutput): IROutput {
  return output;
}

/**
 * Compiles a schema-valid `AgenticApplication` (parser output that has
 * already passed `validateAgenticApplication` — see
 * `@agentform/schema`) into the canonical `AgentformIR`: resolved
 * defaults for every optional collection, `Map`-keyed resource
 * collections, and a deterministic content hash. Runs the full semantic
 * check suite (`validateSemantics`) first; if either schema or semantic
 * validation produced an error-severity diagnostic, no IR is returned —
 * only `ir: undefined` plus every diagnostic collected.
 */
export function buildIR(input: unknown, options: BuildIROptions = {}): BuildIRResult {
  const schemaResult = validateAgenticApplication(input);
  if (!schemaResult.success || !schemaResult.data) {
    return { diagnostics: schemaResult.diagnostics };
  }

  const application = schemaResult.data;
  const semanticDiagnostics = validateSemantics(application);
  const diagnostics = [...schemaResult.diagnostics, ...semanticDiagnostics];

  if (semanticDiagnostics.some((d) => d.severity === 'error')) {
    return { diagnostics };
  }

  const models = new Map(
    Object.entries(application.spec.models).map(([id, m]) => [id, normalizeModel(m)]),
  );
  const tools = new Map(
    Object.entries(application.spec.tools ?? {}).map(([id, t]) => [id, normalizeTool(t)]),
  );
  const agents = new Map(
    Object.entries(application.spec.agents).map(([id, a]) => [id, normalizeAgent(a)]),
  );
  const workflows = new Map<string, IRWorkflow>(
    Object.entries(application.spec.workflows).map(([id, w]) => [
      id,
      { entrypoint: w.entrypoint, nodes: new Map(Object.entries(w.nodes)), edges: w.edges ?? [] },
    ]),
  );
  const memory = new Map(Object.entries(application.spec.memory ?? {}));
  const outputs = new Map(
    Object.entries(application.spec.outputs ?? {}).map(([id, o]) => [id, normalizeOutput(o)]),
  );
  const policies = application.spec.policies ?? [];

  const contentHash = computeContentHash({
    application: {
      apiVersion: application.apiVersion,
      name: application.metadata.name,
      version: application.metadata.version,
      description: application.metadata.description,
      labels: application.metadata.labels ?? {},
      runtime: application.spec.runtime,
    },
    models,
    tools,
    agents,
    workflows,
    memory,
    policies,
    evaluations: application.spec.evaluations,
    observability: application.spec.observability,
    deployment: application.spec.deployment,
    outputs,
  });

  const ir: AgentformIR = {
    irVersion: IR_VERSION,
    compilerVersion: COMPILER_VERSION,
    application: {
      apiVersion: application.apiVersion,
      name: application.metadata.name,
      version: application.metadata.version,
      description: application.metadata.description,
      labels: application.metadata.labels ?? {},
      runtime: application.spec.runtime,
    },
    models,
    tools,
    agents,
    workflows,
    memory,
    policies,
    evaluations: application.spec.evaluations,
    observability: application.spec.observability,
    deployment: application.spec.deployment,
    outputs,
    adapterRequirements: [],
    sourceMap: options.sourceMap ?? new Map(),
    contentHash,
  };

  return { ir, diagnostics };
}
