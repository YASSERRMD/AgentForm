import { stringify } from 'yaml';
import type { ImportCandidate } from '@agentform/plugin-sdk';

const COLLECTION_FOR_KIND: Readonly<Record<string, string>> = {
  model: 'models',
  agent: 'agents',
  tool: 'tools',
  workflow: 'workflows',
};

export interface CandidateSpecOptions {
  readonly applicationName: string;
  readonly target: string;
}

/**
 * Assembles `candidates` (from one or more `ImportInspection`s) into a
 * full Agentform document — the shape `agentform validate` expects, not
 * a guarantee that it actually validates. `models`/`agents`/`tools`/
 * `workflows` are always present (even empty) since the first three are
 * schema-required at the spec level; nothing here claims the individual
 * resource *values* are complete — that's what the import report's
 * `manualActions` are for.
 */
export function buildCandidateSpecDocument(
  candidates: readonly ImportCandidate[],
  options: CandidateSpecOptions,
): string {
  const collections: Record<string, Record<string, unknown>> = {
    models: {},
    agents: {},
    tools: {},
    workflows: {},
  };

  for (const candidate of candidates) {
    const collection = COLLECTION_FOR_KIND[candidate.kind];
    const id = candidate.resourceAddress.split('.').slice(1).join('.');
    if (!collection || !id) {
      continue;
    }
    collections[collection]![id] = candidate.value;
  }

  const document = {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: {
      name: options.applicationName,
      version: '0.1.0',
      description:
        'Candidate specification produced by "agentform import" — review required. Recovered resources are best-effort and were not verified against the original source.',
    },
    spec: {
      runtime: { target: options.target, environment: 'development' },
      ...collections,
    },
  };

  return `${stringify(document, { indent: 2, lineWidth: 0 })}`;
}
