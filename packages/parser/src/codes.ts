import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** This package's reserved `1xxx` range within Agentform's diagnostic code space (see `@agentform/schema`'s `codes.ts` for the full range table). */
export const PARSER_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  SYNTAX_ERROR: {
    code: 'AGF1000',
    summary: 'The source text is not valid YAML or JSON.',
  },
  FILE_NOT_FOUND: {
    code: 'AGF1001',
    summary: 'A referenced file does not exist.',
  },
  UNSAFE_PATH: {
    code: 'AGF1002',
    summary: 'A reference resolves outside the project root.',
  },
  REFERENCE_CYCLE: {
    code: 'AGF1003',
    summary: 'A $ref chain refers back to a file already being resolved.',
  },
  MAX_DEPTH_EXCEEDED: {
    code: 'AGF1004',
    summary: 'A $ref chain exceeds the maximum allowed resolution depth.',
  },
  DUPLICATE_RESOURCE: {
    code: 'AGF1005',
    summary: 'The same resource identifier is declared in more than one file.',
  },
  UNKNOWN_VARIABLE: {
    code: 'AGF1006',
    summary: 'A ${var.*} reference has no declared variable and no default.',
  },
  UNKNOWN_INTERPOLATION_NAMESPACE: {
    code: 'AGF1007',
    summary: 'An interpolation uses a namespace other than env, var, or local.',
  },
  MALFORMED_INTERPOLATION: {
    code: 'AGF1008',
    summary: 'An ${...} interpolation expression could not be parsed.',
  },
  UNKNOWN_ENV_VARIABLE: {
    code: 'AGF1009',
    summary: 'An ${env.*} reference names an environment variable that is not set.',
  },
});
