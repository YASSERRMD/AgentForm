import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { SEMANTIC_DIAGNOSTIC_CODES } from '../codes.js';

const REFERENCEABLE_COLLECTIONS = ['models', 'tools', 'agents', 'workflows'] as const;
type ReferenceableCollection = (typeof REFERENCEABLE_COLLECTIONS)[number];

const REFERENCE_PATTERN = new RegExp(
  `^(${REFERENCEABLE_COLLECTIONS.join('|')})\\.([A-Za-z][A-Za-z0-9_-]*)`,
);

/**
 * An output `value` isn't a defined expression language yet (that's
 * future work — see `docs/adr/0005-ir-and-semantic-validation.md`), so
 * this only validates the one convention the build spec's own examples
 * use: a value that *looks like* `<collection>.<identifier>...` (e.g.
 * `agents.intake.confidence`) is checked against that collection; a value
 * that doesn't match the pattern at all is an opaque literal and isn't
 * validated further, since there's no defined syntax to hold it to.
 */
export function validateOutputReferences(application: AgenticApplication): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { spec } = application;
  const collections: Record<ReferenceableCollection, ReadonlySet<string>> = {
    models: new Set(Object.keys(spec.models)),
    tools: new Set(Object.keys(spec.tools ?? {})),
    agents: new Set(Object.keys(spec.agents)),
    workflows: new Set(Object.keys(spec.workflows)),
  };

  for (const [outputId, output] of Object.entries(spec.outputs ?? {})) {
    const match = REFERENCE_PATTERN.exec(output.value);
    if (!match) {
      continue;
    }
    const [, collection, id] = match as unknown as [string, ReferenceableCollection, string];
    if (!collections[collection].has(id)) {
      diagnostics.push({
        code: SEMANTIC_DIAGNOSTIC_CODES.INVALID_OUTPUT_REFERENCE.code,
        severity: 'error',
        message: `Output "${outputId}" references unknown ${collection.slice(0, -1)} "${id}"`,
        path: ['spec', 'outputs', outputId, 'value'],
      });
    }
  }

  return diagnostics;
}
