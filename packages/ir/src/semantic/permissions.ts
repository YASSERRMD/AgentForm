import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { SEMANTIC_DIAGNOSTIC_CODES } from '../codes.js';

/**
 * A `write`/`destructive` tool with no declared `permissions` is a
 * structural completeness gap — the tool's author never recorded who or
 * what is allowed to invoke it. This is distinct from (and a prerequisite
 * for) the *organizational policy* enforcement of the same concept
 * (`AF003 write-tools-require-explicit-permission`, Phase 6's
 * `@agentform/policy`): this check only asks "is a permissions list
 * present at all", not "does it satisfy this organization's rules".
 */
export function validateToolPermissions(application: AgenticApplication): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [toolId, tool] of Object.entries(application.spec.tools ?? {})) {
    const isWriteCapable = tool.sideEffect === 'write' || tool.sideEffect === 'destructive';
    const hasPermissions = (tool.permissions?.length ?? 0) > 0;

    if (isWriteCapable && !hasPermissions) {
      diagnostics.push({
        code: SEMANTIC_DIAGNOSTIC_CODES.WRITE_TOOL_WITHOUT_PERMISSION.code,
        severity: 'error',
        message: `Tool "${toolId}" has sideEffect "${tool.sideEffect}" but no declared permissions`,
        path: ['spec', 'tools', toolId, 'permissions'],
      });
    }
  }

  return diagnostics;
}
