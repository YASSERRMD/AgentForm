/** The 8 plugin types §11 defines. Only `FrameworkAdapter` has a fleshed-out interface as of Phase 8 — the other 7 are named here (so `PluginType` is already the complete, stable enum a future phase's plugin can declare against) but have no corresponding TypeScript interface yet; inventing one before a phase actually consumes it risks guessing a shape that doesn't match what that phase turns out to need. */
export type PluginType =
  | 'FrameworkAdapter'
  | 'StateBackend'
  | 'SecretProvider'
  | 'PolicyProvider'
  | 'EvaluationProvider'
  | 'DeploymentProvider'
  | 'ModelProvider'
  | 'ToolProvider';

/** Verbatim shape from §11. Every plugin — regardless of type — exposes this. */
export interface AgentformPluginManifest {
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly type: PluginType;
  readonly capabilities: readonly string[];
  readonly supportedSpecVersions: readonly string[];
}
