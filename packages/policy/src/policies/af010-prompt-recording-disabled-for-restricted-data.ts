import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * §18 requires that prompts are not recorded by default, and never for
 * restricted data. `spec.observability.recordPrompts` defaults to unset
 * (safe); this only fires when it is explicitly `true` while some tool in
 * the document is classified `restricted`.
 */
export const af010PromptRecordingDisabledForRestrictedData: PolicyDefinition = {
  id: 'AF010',
  name: 'prompt-recording-disabled-for-restricted-data',
  description: 'Reject recordPrompts: true when the document has restricted-classification tools.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const { observability, tools } = context.application.spec;
    if (observability?.recordPrompts !== true) {
      return [];
    }
    const hasRestrictedTool = Object.values(tools ?? {}).some(
      (tool) => tool.dataClassification === 'restricted',
    );
    if (!hasRestrictedTool) {
      return [];
    }
    const finding: PolicyFinding = {
      message: 'spec.observability.recordPrompts is true but the document has a restricted-classification tool.',
      resourceAddress: 'spec.observability.recordPrompts',
      remediation: 'Set recordPrompts to false (or remove it) whenever restricted data is in scope.',
    };
    return [finding];
  },
};
