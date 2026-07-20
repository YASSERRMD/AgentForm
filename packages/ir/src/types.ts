import type { SourceLocation } from '@agentform/diagnostics';
import type {
  Agent,
  Deployment,
  Evaluation,
  Memory,
  Model,
  Observability,
  Output,
  Runtime,
  Tool,
  WorkflowEdge,
  WorkflowNode,
} from '@agentform/schema';
import type { ResourceId } from './identifiers.js';

// Resource-level IR shapes are the validated schema shapes as-is — §6's
// field lists are already what the IR needs at the leaf level. What Phase
// 4 adds is graph-level structure (the Map-keyed collections below),
// resolved defaults (applied by `buildIR`, not encoded in these types —
// e.g. an agent's `tools` is always populated even when the source
// omitted it), and everything in `AgentformIR` itself: source maps,
// content hashing, and version/requirement metadata.
export type IRModel = Model;
export type IRTool = Tool;
export type IRAgent = Agent;
export type IRMemory = Memory;
export type IREvaluation = Evaluation;
export type IRObservability = Observability;
export type IRDeployment = Deployment;
export type IROutput = Output;
export type IRWorkflowNode = WorkflowNode;
export type IRWorkflowEdge = WorkflowEdge;

export interface IRWorkflow {
  readonly entrypoint: ResourceId;
  readonly nodes: ReadonlyMap<ResourceId, IRWorkflowNode>;
  readonly edges: readonly IRWorkflowEdge[];
}

export interface IRApplication {
  readonly apiVersion: string;
  readonly name: ResourceId;
  readonly version: string;
  readonly description?: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly runtime: Runtime;
}

/**
 * The canonical, framework-neutral intermediate representation (§8).
 * Every collection is a `ReadonlyMap` (or `readonly` array) — never a
 * plain mutable object or array a caller could push into — and every
 * field on every nested IR* type is itself `readonly`, satisfying "Do not
 * expose mutable maps directly through the public API."
 */
export interface AgentformIR {
  readonly irVersion: string;
  readonly compilerVersion: string;
  readonly application: IRApplication;
  readonly models: ReadonlyMap<ResourceId, IRModel>;
  readonly tools: ReadonlyMap<ResourceId, IRTool>;
  readonly agents: ReadonlyMap<ResourceId, IRAgent>;
  readonly workflows: ReadonlyMap<ResourceId, IRWorkflow>;
  readonly memory: ReadonlyMap<ResourceId, IRMemory>;
  readonly policies: readonly ResourceId[];
  readonly evaluations?: IREvaluation;
  readonly observability?: IRObservability;
  readonly deployment?: IRDeployment;
  readonly outputs: ReadonlyMap<ResourceId, IROutput>;
  /** Framework/runtime requirements adapters will impose — empty until Phase 8+ adapters exist to impose any. */
  readonly adapterRequirements: readonly string[];
  readonly sourceMap: ReadonlyMap<string, SourceLocation>;
  /** `sha256:<hex>` over the resolved resource content only — stable across source formatting/ordering, sensitive to any actual value change. See `hash.ts`. */
  readonly contentHash: string;
}
