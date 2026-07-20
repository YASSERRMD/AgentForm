import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * Every tool should declare a `timeout` (§6.4) so a hung call can't stall
 * a run indefinitely. Kept non-mandatory and warning-severity by default —
 * unlike missing permissions or a missing approval gate, a missing
 * timeout is a hygiene concern an organization may reasonably choose to
 * accept for a specific low-risk tool, with justification.
 */
export const af006ToolsRequireTimeouts: PolicyDefinition = {
  id: 'AF006',
  name: 'tools-require-timeouts',
  description: 'Warn about tools that declare no timeout.',
  defaultSeverity: 'warning',
  mandatory: false,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};
    for (const [toolId, tool] of Object.entries(tools)) {
      if (tool.timeout !== undefined) {
        continue;
      }
      findings.push({
        message: `Tool "${toolId}" declares no timeout.`,
        resourceAddress: `spec.tools.${toolId}`,
        remediation: 'Add a `timeout` so a hung call cannot stall a run indefinitely.',
      });
    }
    return findings;
  },
};
