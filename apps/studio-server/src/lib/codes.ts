import { defineDiagnosticCodes } from '@agentform/diagnostics';

/** Studio's reserved `8xxx` range within Agentform's diagnostic code space (see `@agentform/schema`'s `codes.ts` for the full range table). Diagnostics studio-server itself generates, not ones proxied through from the parser/IR/policy pipeline. */
export const STUDIO_DIAGNOSTIC_CODES = defineDiagnosticCodes({
  MULTI_FILE_PROJECT_NOT_WRITABLE: {
    code: 'AGF8001',
    summary: 'The project spans more than one file — Studio cannot yet write a patch back safely.',
  },
});
