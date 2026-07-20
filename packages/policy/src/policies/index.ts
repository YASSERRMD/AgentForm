import { af001NoInlineSecrets } from './af001-no-inline-secrets.js';
import { af002NoUnrestrictedShellTools } from './af002-no-unrestricted-shell-tools.js';
import { af003WriteToolsRequireExplicitPermission } from './af003-write-tools-require-explicit-permission.js';
import { af004CriticalActionsRequireHumanApproval } from './af004-critical-actions-require-human-approval.js';
import { af005WorkflowLoopsRequireLimits } from './af005-workflow-loops-require-limits.js';
import type { PolicyDefinition } from '../types.js';

export {
  af001NoInlineSecrets,
  af002NoUnrestrictedShellTools,
  af003WriteToolsRequireExplicitPermission,
  af004CriticalActionsRequireHumanApproval,
  af005WorkflowLoopsRequireLimits,
};

/** Every built-in policy (AF001-AF015), in ID order. Grows as later tasks in this phase add AF006-AF015. */
export const BUILTIN_POLICIES: readonly PolicyDefinition[] = [
  af001NoInlineSecrets,
  af002NoUnrestrictedShellTools,
  af003WriteToolsRequireExplicitPermission,
  af004CriticalActionsRequireHumanApproval,
  af005WorkflowLoopsRequireLimits,
];
