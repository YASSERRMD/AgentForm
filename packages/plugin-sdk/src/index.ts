export type { PluginType, AgentformPluginManifest } from './manifest.js';
export type {
  FeatureSupportLevel,
  FeatureSupportEntry,
  CompatibilityReport,
} from './compatibility.js';
export type { GeneratedFile, GeneratedManifest, GeneratedProject } from './generated-project.js';
export type {
  AdapterContext,
  GenerationContext,
  ImportContext,
  ImportCandidate,
  ImportInspection,
  DeploymentContext,
  DeploymentResult,
  AdapterDeploymentState,
  DestroyContext,
  DestroyResult,
  FrameworkAdapter,
} from './adapter.js';

export const PACKAGE_NAME = '@agentform/plugin-sdk';
export const PACKAGE_VERSION = '0.1.0';
