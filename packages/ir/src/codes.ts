import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** This package's reserved `3xxx` range within Agentform's diagnostic code space (parser: 1xxx, schema: 2xxx, semantic/IR: 3xxx — see `@agentform/schema`'s `codes.ts`). Covers every semantic check from §4 Phase 4's minimum-checks list. */
export const SEMANTIC_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  UNKNOWN_MODEL: { code: 'AGF3001', summary: 'An agent references a model that is not declared.' },
  UNKNOWN_TOOL: {
    code: 'AGF3002',
    summary: 'An agent or workflow node references a tool that is not declared.',
  },
  UNKNOWN_AGENT: {
    code: 'AGF3003',
    summary: 'A workflow node references an agent that is not declared.',
  },
  UNKNOWN_WORKFLOW_NODE: {
    code: 'AGF3004',
    summary:
      'An entrypoint, edge, or onError field references a workflow node that does not exist.',
  },
  UNREACHABLE_NODE: {
    code: 'AGF3005',
    summary: 'A workflow node has no path to it from the entrypoint.',
  },
  MISSING_TERMINAL_PATH: {
    code: 'AGF3006',
    summary: 'No path from the entrypoint reaches a terminal node.',
  },
  UNLIMITED_LOOP: {
    code: 'AGF3007',
    summary: 'A workflow graph cycle exists that is not bounded by a loop node with maxIterations.',
  },
  DUPLICATE_EDGE: {
    code: 'AGF3008',
    summary: 'The same from/to/when transition is declared more than once.',
  },
  CONFLICTING_TRANSITION: {
    code: 'AGF3009',
    summary:
      'A node has more than one unconditional outgoing edge, so the transition is ambiguous.',
  },
  INVALID_APPROVAL_REFERENCE: {
    code: 'AGF3010',
    summary:
      'An edge references approval.* in its "when" expression from a non-humanApproval node.',
  },
  WRITE_TOOL_WITHOUT_PERMISSION: {
    code: 'AGF3011',
    summary: 'A tool with a write/destructive side effect has no declared permissions.',
  },
  INVALID_MEMORY_REFERENCE: {
    code: 'AGF3012',
    summary: 'An agent references a memory resource that is not declared.',
  },
  INVALID_SUBWORKFLOW: {
    code: 'AGF3013',
    summary: 'A subworkflow node references a workflow that is not declared.',
  },
  CIRCULAR_SUBWORKFLOW: {
    code: 'AGF3014',
    summary: 'A chain of subworkflow references eventually refers back to its starting workflow.',
  },
  INVALID_OUTPUT_REFERENCE: {
    code: 'AGF3015',
    summary:
      'An output value references a resource collection and identifier that is not declared.',
  },
});
