import { defineDiagnosticCodes } from '@agentform/diagnostics';

/**
 * Stable, documented codes for every diagnostic the schema-validation stage
 * can produce. `2xxx` is this package's reserved range within Agentform's
 * overall diagnostic code space (parser: 1xxx, schema: 2xxx, semantic/IR:
 * 3xxx; built-in policies keep the separate `AF0xx` numbering already
 * defined in §16 of the build spec, since those identify policies, not
 * diagnostics).
 */
export const SCHEMA_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  INVALID_DOCUMENT: {
    code: 'AGF2000',
    summary: 'The document does not match the AgenticApplication schema.',
  },
  MISSING_FIELD: {
    code: 'AGF2001',
    summary: 'A required field is missing.',
  },
  INVALID_TYPE: {
    code: 'AGF2002',
    summary: 'A field has a value of the wrong type.',
  },
  INVALID_VALUE: {
    code: 'AGF2003',
    summary: 'A field has a value outside its allowed literal(s) or enum.',
  },
  INVALID_FORMAT: {
    code: 'AGF2004',
    summary:
      'A string field does not match its required format (identifier, semver, duration, URL, ...).',
  },
  OUT_OF_RANGE: {
    code: 'AGF2005',
    summary: 'A numeric or array field is outside its allowed size or range.',
  },
  UNRECOGNIZED_KEY: {
    code: 'AGF2006',
    summary: 'An object contains a key that is not part of the schema.',
  },
  DUPLICATE_ENTRY: {
    code: 'AGF2007',
    summary: 'An array field contains the same entry more than once.',
  },
  INVALID_UNION: {
    code: 'AGF2008',
    summary:
      'A value did not match any variant of a discriminated union (e.g. an unknown tool or node "type").',
  },
  UNKNOWN: {
    code: 'AGF2999',
    summary: 'An unclassified schema validation failure.',
  },
});
