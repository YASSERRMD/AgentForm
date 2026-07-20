import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * Any tool classified as `write` or `destructive` (§6.4 `sideEffect`) must
 * declare a non-empty `permissions` list. Independently configurable
 * counterpart to the IR's `AGF3011` semantic check (`@agentform/ir`),
 * which enforces the same rule unconditionally at build time — this
 * policy version can be tuned (with justification) per organization,
 * where the semantic check cannot.
 */
export const af003WriteToolsRequireExplicitPermission: PolicyDefinition = {
  id: 'AF003',
  name: 'write-tools-require-explicit-permission',
  description: 'Reject write or destructive tools that declare no explicit permissions.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};
    for (const [toolId, tool] of Object.entries(tools)) {
      if (tool.sideEffect !== 'write' && tool.sideEffect !== 'destructive') {
        continue;
      }
      if ((tool.permissions?.length ?? 0) > 0) {
        continue;
      }
      findings.push({
        message: `Tool "${toolId}" has sideEffect "${tool.sideEffect}" but declares no permissions.`,
        resourceAddress: `spec.tools.${toolId}`,
        remediation: 'Add an explicit `permissions` list scoping what this tool may do.',
      });
    }
    return findings;
  },
};
