import { defineDiagnosticCodes } from '@agentform/diagnostics';

/**
 * This package's reserved `4xxx` range within Agentform's diagnostic code
 * space (parser: 1xxx, schema: 2xxx, semantic/IR: 3xxx, policy engine:
 * 4xxx). These codes cover problems with the *evaluation of overrides*
 * (asking for something the engine refuses to do) — they are distinct
 * from the `AFxxx` catalog used to identify individual built-in policies
 * (AF001-AF015, see `policies/*.ts`), which are policy IDs, not diagnostics.
 */
export const POLICY_ENGINE_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  MANDATORY_POLICY_OVERRIDE_REJECTED: {
    code: 'AGF4001',
    summary: 'A configuration override tried to change the severity of a mandatory policy.',
  },
  MISSING_OVERRIDE_JUSTIFICATION: {
    code: 'AGF4002',
    summary: 'A configuration override downgrades a policy without a non-empty justification.',
  },
  UNKNOWN_POLICY_OVERRIDE: {
    code: 'AGF4003',
    summary: 'A configuration override references a policy ID that does not exist.',
  },
  INVALID_POLICY_CONFIG: {
    code: 'AGF4004',
    summary: 'The policy configuration document does not match the expected shape.',
  },
});
