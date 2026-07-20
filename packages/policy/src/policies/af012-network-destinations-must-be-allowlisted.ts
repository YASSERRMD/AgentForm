import type { PolicyDefinition, PolicyFinding } from '../types.js';

const NETWORK_TOOL_TYPES = new Set(['http', 'openapi']);

/**
 * Agentform has no separate organization-level network allowlist registry
 * yet (that belongs to the deployment/state work in later phases), so
 * "must be allowlisted" is enforced at the only layer available today: a
 * tool that inherently makes raw network calls (`http`/`openapi`) must
 * explicitly declare `networkDestination` (§6.4) rather than leaving it
 * unconstrained. An undeclared destination can't be allowlisted by
 * anything, so it's rejected outright.
 */
export const af012NetworkDestinationsMustBeAllowlisted: PolicyDefinition = {
  id: 'AF012',
  name: 'network-destinations-must-be-allowlisted',
  description: 'Reject http/openapi tools that declare no networkDestination.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};
    for (const [toolId, tool] of Object.entries(tools)) {
      if (!NETWORK_TOOL_TYPES.has(tool.type)) {
        continue;
      }
      if (tool.networkDestination !== undefined) {
        continue;
      }
      findings.push({
        message: `Tool "${toolId}" (type "${tool.type}") declares no networkDestination.`,
        resourceAddress: `spec.tools.${toolId}`,
        remediation:
          'Set networkDestination to the specific host(s) this tool is allowed to reach.',
      });
    }
    return findings;
  },
};
