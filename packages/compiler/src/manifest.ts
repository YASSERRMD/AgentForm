import type { AgentformPluginManifest, GeneratedManifest } from '@agentform/plugin-sdk';

export interface BuildManifestParams {
  readonly adapter: AgentformPluginManifest;
  readonly agentformVersion: string;
  readonly specVersion: string;
  readonly sourceHash: string;
  readonly irHash: string;
}

/**
 * Builds the §22 manifest shape adapters attach to every `GeneratedProject`.
 * A shared helper (rather than each adapter building its own object
 * literal) keeps the shape — including `generatedAt: null`, always, never
 * a real timestamp — consistent by construction instead of by convention.
 */
export function buildManifest(params: BuildManifestParams): GeneratedManifest {
  return {
    generatedBy: 'agentform',
    agentformVersion: params.agentformVersion,
    specVersion: params.specVersion,
    adapter: params.adapter.name,
    adapterVersion: params.adapter.version,
    sourceHash: params.sourceHash,
    irHash: params.irHash,
    generatedAt: null,
  };
}
