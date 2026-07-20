import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * Every model must name a non-blank `provider`. The schema already
 * requires `provider: z.string().min(1)`, but `min(1)` accepts a
 * single-space string — this check closes that gap by requiring at least
 * one non-whitespace character, so "provider" can't be satisfied with a
 * value that is blank in every way that matters.
 */
export const af007ModelsRequireExplicitProvider: PolicyDefinition = {
  id: 'AF007',
  name: 'models-require-explicit-provider',
  description: 'Reject models whose provider is blank once whitespace is trimmed.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    for (const [modelId, model] of Object.entries(context.application.spec.models)) {
      if (model.provider.trim().length > 0) {
        continue;
      }
      findings.push({
        message: `Model "${modelId}" has a blank provider.`,
        resourceAddress: `spec.models.${modelId}.provider`,
        remediation: 'Set provider to the name of the framework/vendor that serves this model.',
      });
    }
    return findings;
  },
};
