import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** This package's reserved `5xxx` range within Agentform's diagnostic code space (parser: 1xxx, schema: 2xxx, semantic/IR: 3xxx, policy engine: 4xxx, compiler: 5xxx). */
export const COMPILER_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  UNSUPPORTED_FEATURE: {
    code: 'AGF5001',
    summary: 'The target framework cannot represent a feature the specification uses.',
  },
  GENERATION_FAILED: {
    code: 'AGF5002',
    summary: 'Code generation failed for the target framework.',
  },
  SECRET_LEAK_BLOCKED: {
    code: 'AGF5003',
    summary: 'Generation was blocked because a generated file would have contained a secret-shaped value.',
  },
});
