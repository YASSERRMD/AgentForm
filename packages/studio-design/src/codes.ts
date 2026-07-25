import { defineDiagnosticCodes } from '@agentform/diagnostics';

/**
 * Continues Studio's reserved `8xxx` range (see `apps/studio-server/src/lib/codes.ts`,
 * which owns `AGF8001`) rather than opening a new range — these are also
 * Studio-originated diagnostics, just produced by the design-artifact model
 * instead of the spec-patch write path.
 */
export const DESIGN_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  DANGLING_RESOURCE_BINDING: {
    code: 'AGF8002',
    summary: 'A design artifact is bound to a resource id that does not exist in the spec.',
  },
  DANGLING_FIELD_PATH: {
    code: 'AGF8003',
    summary:
      'A form-layout node references a field that is not present in the bound agent’s input/output schema.',
  },
  DANGLING_POSITION_NODE: {
    code: 'AGF8004',
    summary: 'A canvas position references a node id that is not present in the bound workflow.',
  },
  SUBJECT_SHAPE_MISMATCH: {
    code: 'AGF8005',
    summary:
      'A design artifact carries layout data that does not match its binding’s resource type (e.g. workflow positions on an agents-bound design).',
  },
});
