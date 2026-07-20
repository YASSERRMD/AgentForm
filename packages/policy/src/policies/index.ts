import { af001NoInlineSecrets } from './af001-no-inline-secrets.js';
import { af002NoUnrestrictedShellTools } from './af002-no-unrestricted-shell-tools.js';
import { af003WriteToolsRequireExplicitPermission } from './af003-write-tools-require-explicit-permission.js';
import { af004CriticalActionsRequireHumanApproval } from './af004-critical-actions-require-human-approval.js';
import { af005WorkflowLoopsRequireLimits } from './af005-workflow-loops-require-limits.js';
import { af006ToolsRequireTimeouts } from './af006-tools-require-timeouts.js';
import { af007ModelsRequireExplicitProvider } from './af007-models-require-explicit-provider.js';
import { af008ProductionRequiresEvaluationGates } from './af008-production-requires-evaluation-gates.js';
import { af009SensitiveDataRequiresResidency } from './af009-sensitive-data-requires-residency.js';
import { af010PromptRecordingDisabledForRestrictedData } from './af010-prompt-recording-disabled-for-restricted-data.js';
import type { PolicyDefinition } from '../types.js';

export {
  af001NoInlineSecrets,
  af002NoUnrestrictedShellTools,
  af003WriteToolsRequireExplicitPermission,
  af004CriticalActionsRequireHumanApproval,
  af005WorkflowLoopsRequireLimits,
  af006ToolsRequireTimeouts,
  af007ModelsRequireExplicitProvider,
  af008ProductionRequiresEvaluationGates,
  af009SensitiveDataRequiresResidency,
  af010PromptRecordingDisabledForRestrictedData,
};

/** Every built-in policy (AF001-AF015), in ID order. Grows as later tasks in this phase add AF011-AF015. */
export const BUILTIN_POLICIES: readonly PolicyDefinition[] = [
  af001NoInlineSecrets,
  af002NoUnrestrictedShellTools,
  af003WriteToolsRequireExplicitPermission,
  af004CriticalActionsRequireHumanApproval,
  af005WorkflowLoopsRequireLimits,
  af006ToolsRequireTimeouts,
  af007ModelsRequireExplicitProvider,
  af008ProductionRequiresEvaluationGates,
  af009SensitiveDataRequiresResidency,
  af010PromptRecordingDisabledForRestrictedData,
];
