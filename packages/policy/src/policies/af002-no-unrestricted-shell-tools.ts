import type { PolicyDefinition, PolicyFinding } from '../types.js';

const SHELL_INDICATOR = /\b(shell|bash|zsh|sh|cmd|powershell|exec|subprocess|system)\b/i;

/** The field on each tool type most likely to name what it actually runs. */
function shellIndicatorTarget(tool: { type: string } & Record<string, unknown>): string | undefined {
  switch (tool.type) {
    case 'function':
      return typeof tool.handler === 'string' ? tool.handler : undefined;
    case 'customPlugin':
      return typeof tool.plugin === 'string' ? tool.plugin : undefined;
    case 'mcp':
      return typeof tool.operation === 'string' ? tool.operation : undefined;
    default:
      return undefined;
  }
}

/**
 * Flags a tool that looks like it can run arbitrary shell commands
 * (its handler/plugin/operation name mentions a shell or exec-family
 * indicator) but declares no `permissions` scoping what it's allowed to
 * do. Agentform has no dedicated "shell" tool type by design (§6.4) —
 * shell access shows up as a `function` or `customPlugin` tool, which is
 * exactly why this can't be a schema-level restriction and needs a policy.
 */
export const af002NoUnrestrictedShellTools: PolicyDefinition = {
  id: 'AF002',
  name: 'no-unrestricted-shell-tools',
  description: 'Reject shell-capable tools that declare no explicit permissions.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const tools = context.application.spec.tools ?? {};
    for (const [toolId, tool] of Object.entries(tools)) {
      const indicatorTarget = shellIndicatorTarget(tool);
      if (!indicatorTarget || !SHELL_INDICATOR.test(indicatorTarget)) {
        continue;
      }
      const hasPermissions = (tool.permissions?.length ?? 0) > 0;
      if (hasPermissions) {
        continue;
      }
      findings.push({
        message: `Tool "${toolId}" appears to run shell commands ("${indicatorTarget}") but declares no permissions.`,
        resourceAddress: `spec.tools.${toolId}`,
        remediation:
          'Add an explicit `permissions` list scoping what this tool may do, or replace free-form shell execution with a narrower typed tool.',
      });
    }
    return findings;
  },
};
