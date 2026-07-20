import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * Any tool with `sideEffect: 'destructive'` must declare a non-blank
 * `idempotencyStrategy` (§6.4) — a retried destructive call is only safe
 * to automatically retry (e.g. after a timeout) if the tool documents how
 * it avoids double-applying the effect.
 */
export const af011DestructiveToolsRequireIdempotencyStrategy: PolicyDefinition = {
  id: 'AF011',
  name: 'destructive-tools-require-idempotency-strategy',
  description: 'Reject destructive tools that declare no idempotency strategy.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};
    for (const [toolId, tool] of Object.entries(tools)) {
      if (tool.sideEffect !== 'destructive') {
        continue;
      }
      if ((tool.idempotencyStrategy ?? '').trim().length > 0) {
        continue;
      }
      findings.push({
        message: `Tool "${toolId}" has sideEffect "destructive" but declares no idempotencyStrategy.`,
        resourceAddress: `spec.tools.${toolId}`,
        remediation: 'Set idempotencyStrategy to describe how a retried call avoids double-applying the effect.',
      });
    }
    return findings;
  },
};
