import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** This package's reserved `6xxx` range within Agentform's diagnostic code space (parser: 1xxx, schema: 2xxx, semantic/IR: 3xxx, policy engine: 4xxx, compiler: 5xxx, evaluator: 6xxx). */
export const EVALUATOR_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  EVALUATION_GATE_NEVER_RUN: {
    code: 'AGF6001',
    summary:
      'A production environment declares evaluation gates, but agentform test has never been run (or its results file is missing/invalid).',
  },
  EVALUATION_GATE_STALE: {
    code: 'AGF6002',
    summary:
      'The specification has changed since agentform test last ran — its recorded results no longer reflect the current specification.',
  },
  EVALUATION_GATE_FAILED: {
    code: 'AGF6003',
    summary: 'The most recent agentform test run for the current specification did not pass.',
  },
});
