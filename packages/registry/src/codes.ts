import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** This package's reserved `7xxx` range within Agentform's diagnostic code space (see `@agentform/schema`'s `codes.ts` for the full range table: 1xxx parser, 2xxx schema, 3xxx ir, 4xxx policy, 5xxx compiler, 6xxx evaluator, 7xxx registry). */
export const REGISTRY_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  MODULE_NOT_FOUND: {
    code: 'AGF7001',
    summary: 'A declared module is not published in the configured registry.',
  },
  MODULE_INTEGRITY_FAILURE: {
    code: 'AGF7002',
    summary: "A module's recorded content hash does not match its published definition.",
  },
  MODULE_SCHEMA_INVALID: {
    code: 'AGF7003',
    summary: 'A resolved module definition failed schema validation.',
  },
  MODULE_MISSING_REQUIRED_INPUT: {
    code: 'AGF7004',
    summary: 'A module input with no default was not supplied by the consuming project.',
  },
  MODULE_RESOURCE_COLLISION: {
    code: 'AGF7005',
    summary:
      'A module-provided resource identifier collides with one already declared in the project.',
  },
  MODULE_SIGNATURE_UNVERIFIED: {
    code: 'AGF7006',
    summary: "A module's signature could not be verified against the configured trusted key.",
  },
});
