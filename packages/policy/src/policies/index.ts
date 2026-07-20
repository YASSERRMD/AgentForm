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
import { af011DestructiveToolsRequireIdempotencyStrategy } from './af011-destructive-tools-require-idempotency-strategy.js';
import { af012NetworkDestinationsMustBeAllowlisted } from './af012-network-destinations-must-be-allowlisted.js';
import { af013ProductionModelAliasesMustBePinned } from './af013-production-model-aliases-must-be-pinned.js';
import { af014StateMustNotContainSecrets } from './af014-state-must-not-contain-secrets.js';
import { af015GeneratedCodeMustBeReproducible } from './af015-generated-code-must-be-reproducible.js';
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
  af011DestructiveToolsRequireIdempotencyStrategy,
  af012NetworkDestinationsMustBeAllowlisted,
  af013ProductionModelAliasesMustBePinned,
  af014StateMustNotContainSecrets,
  af015GeneratedCodeMustBeReproducible,
};

/** Every built-in policy, AF001-AF015, in ID order. */
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
  af011DestructiveToolsRequireIdempotencyStrategy,
  af012NetworkDestinationsMustBeAllowlisted,
  af013ProductionModelAliasesMustBePinned,
  af014StateMustNotContainSecrets,
  af015GeneratedCodeMustBeReproducible,
];
